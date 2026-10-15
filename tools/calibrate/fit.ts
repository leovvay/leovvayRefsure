import { readFileSync, writeFileSync } from 'node:fs';
import { familyOf, KNOWN_FAMILIES, SITES } from '../../src/questions';
import type { CalibrationEntry, SiteId } from '../../src/questions';
import { flags, list, need } from './lib/args';
import { fitSite } from './lib/fit-site';
import { readJsonl } from './lib/jsonl';
import type { RunRow } from './lib/run-row';
import type { SetMeta } from './lib/set-meta';
import type { SiteFit } from './lib/site-fit';

/*
  Calibration step 1, fit. Reads runs-<site>.jsonl files and the converted sets' meta files, fits each site
  (lib/fit-site.ts), prints one report line per site, and with --write replaces that site's Jev entry in
  calibration.json: a site that qualifies gets a `measured` entry with its provenance; one that does not loses
  any earlier entry for the same wording and family.

    fit --runs <runs-a.jsonl,runs-b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>]
        [--target 0.99] [--min-points 10] [--method isotonic|cumulative] [--route openrouter.ai] [--source "<text>"]
*/

const USAGE = 'usage: fit --runs <a.jsonl,b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>] [--target 0.99] [--min-points 10] [--method isotonic|cumulative] [--route host] [--source text]';
const SOURCE = 'frozen browser benchmark sets, 2026-10-13 (not published)';
const METHODS = {
  isotonic: 'isotonic fit (pool-adjacent-violators) of acted answers on confidence; lowest score with calibrated precision at or above the target and at least min-points answers beyond it',
  cumulative: 'lowest confidence at which the acted answers at or above it reach the target precision, with at least min-points of them',
} as const;
const ROWS = 'each row max(fitted, starting row), non-decreasing along the risk order';

const values = flags(process.argv.slice(2), ['runs', 'metas', 'write', 'target', 'min-points', 'method', 'route', 'source'], USAGE);
const runFiles = list(values, 'runs', []);
if (runFiles.length === 0) need(values, 'runs', USAGE);
const metas = list(values, 'metas', []).map((path) => JSON.parse(readFileSync(path, 'utf8')) as SetMeta);
const method = values.method === 'cumulative' ? 'cumulative' : 'isotonic';
if (values.method !== undefined && values.method !== method) {
  process.stderr.write(`--method is isotonic or cumulative\n${USAGE}\n`);
  process.exit(64);
}
const opts = { target: Number(values.target ?? 0.99), minPoints: Number(values['min-points'] ?? 10), method } as const;
const route = typeof values.route === 'string' ? values.route : 'openrouter.ai';
const source = typeof values.source === 'string' ? values.source : SOURCE;
const date = new Date().toISOString().slice(0, 10);

function entryFor(fit: SiteFit, rows: readonly RunRow[], meta: SetMeta, model: string): CalibrationEntry {
  const fitted: Record<string, number | null> = {};
  for (const [name, edge] of Object.entries(fit.fits)) fitted[name] = edge.value;
  return {
    site: fit.site, wordingHash: SITES[fit.site].wording.hash, lineFormat: 1, modelFamily: KNOWN_FAMILIES.jev,
    provider: 'jev', threshold: fit.threshold!, setSha256: meta.sha256, n: fit.runs,
    coverageAtP99: fit.coverage ?? 0, precisionAtP99: fit.precision ?? 0, date,
    provenance: {
      source, set: meta.set, items: fit.items, runs: fit.runs, orders: new Set(rows.map((row) => row.salt)).size,
      model, route, method: `${METHODS[method]}; ${ROWS}`, target: opts.target, minPoints: opts.minPoints, fitted,
      acted: fit.acted, correct: fit.correct,
    },
  };
}

const fresh: CalibrationEntry[] = [];
const refit = new Set<string>();
for (const file of runFiles) {
  const rows = readJsonl<RunRow>(file);
  const site = rows[0]?.site as SiteId | undefined;
  if (site === undefined) throw new Error(`${file} holds no runs`);
  const meta = metas.find((m) => m.site === site);
  if (!meta) throw new Error(`no --metas file for site ${site}`);
  const models = [...new Set(rows.filter((row) => row.status === 'ok').map((row) => row.model ?? ''))];
  if (models.length !== 1 || familyOf(models[0]!) !== KNOWN_FAMILIES.jev) {
    throw new Error(`${file}: answered by ${models.join(', ')}; a fit needs one model of family ${KNOWN_FAMILIES.jev}`);
  }
  const fit = fitSite(site, rows, opts);
  refit.add(`${site}\u0000${SITES[site].wording.hash}`);
  process.stdout.write(`${JSON.stringify(fit)}\n`);
  if (fit.threshold !== null) fresh.push(entryFor(fit, rows.filter((row) => row.status === 'ok'), meta, models[0]!));
}

if (typeof values.write === 'string') {
  const path = values.write;
  const current = JSON.parse(readFileSync(path, 'utf8')) as { version: number; entries: CalibrationEntry[] };
  const kept = current.entries.filter((entry) => !(entry.provider === 'jev' && entry.modelFamily === KNOWN_FAMILIES.jev
    && entry.lineFormat === 1 && refit.has(`${entry.site}\u0000${entry.wordingHash}`)));
  const order = Object.keys(SITES);
  const entries = [...kept, ...fresh].sort((a, b) => order.indexOf(a.site) - order.indexOf(b.site));
  writeFileSync(path, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  process.stderr.write(`wrote ${entries.length} entries to ${path} (${fresh.length} measured now)\n`);
}
