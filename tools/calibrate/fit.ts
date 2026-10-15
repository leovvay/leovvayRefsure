import { readFileSync, writeFileSync } from 'node:fs';
import { familyOf, KNOWN_FAMILIES, SITES } from '../../src/questions';
import type { CalibrationEntry, SiteId } from '../../src/questions';
import { flags, list, need, opt } from './lib/args';
import { fitSite } from './lib/fit-site';
import { readJsonl } from './lib/jsonl';
import { nativeSummary, pooledSha256 } from './lib/native-summary';
import type { RunRow } from './lib/run-row';
import type { SetMeta } from './lib/set-meta';
import type { ShippedEntry } from './lib/shipped-entry';
import type { SiteFit } from './lib/site-fit';

/*
  Calibration fit (steps 1 and 2). Reads runs-<site>.jsonl files and the sets' meta files and fits each site on
  every replay given for it, pooled (lib/fit-site.ts). One report line per site carries the pooled fit, its Wilson
  lower bound, the per-set split and each replay's rows alone. With --write it updates that site's Jev entry in
  calibration.json.
  - Step 1 (converted sets): a site that qualifies gets a `measured` entry; one that does not loses any earlier
    entry for the same wording and family.
  - Step 2 (Orca-native sets, their metas carry `native`): several sets may pool into one site, and --floor names
    the entries already shipped. A floor's rows are the starting rows, so nothing ships looser; a site whose native
    fit gives no row keeps its shipped entry, and either way the native reading is written into its provenance.
    --text-only leaves out calls whose set marks the answer as visible only in the picture.

    fit --runs <a.jsonl,b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>] [--floor <calibration.json>]
        [--text-only] [--target 0.99] [--min-points 10] [--method isotonic|cumulative] [--route host] [--source text]
*/

const USAGE = 'usage: fit --runs <a.jsonl,b.jsonl> --metas <a.meta.json,b.meta.json> [--write <calibration.json>] [--floor <calibration.json>] [--text-only] [--target 0.99] [--min-points 10] [--method isotonic|cumulative] [--route host] [--source text]';
const SOURCE = 'frozen browser benchmark sets, 2026-10-13 (not published)';
const NATIVE_SOURCES = {
  refsure: 'refsure-authored synthetic sets (tools/calibrate/sets)',
  frozen: 'frozen browser benchmark sets with stored pages, 2026-10-13 (not published)',
} as const;

/** Where a native site's sets came from, named without publishing them. */
function nativeSource(sets: readonly SetMeta[]): string {
  const origins = [...new Set(sets.map((meta) => meta.native?.origin ?? 'frozen'))].sort().reverse();
  return `${origins.map((origin) => NATIVE_SOURCES[origin]).join(' and ')}, replayed in Orca`;
}
const METHODS = {
  isotonic: 'isotonic fit (pool-adjacent-violators) of acted answers on confidence, pooled over every replay; lowest score below 1.0 with calibrated precision at or above the target and at least min-points answers beyond it',
  cumulative: 'lowest confidence below 1.0 at which the acted answers at or above it, pooled over every replay, reach the target precision, with at least min-points of them',
} as const;
const ROWS = 'each row max(fitted, starting row), non-decreasing along the risk order';

const values = flags(process.argv.slice(2), ['runs', 'metas', 'write', 'floor', 'target', 'min-points', 'method', 'route', 'source'], USAGE, ['text-only']);
const runFiles = list(values, 'runs', []);
if (runFiles.length === 0) need(values, 'runs', USAGE);
const metas = list(values, 'metas', []).map((path) => JSON.parse(readFileSync(path, 'utf8')) as SetMeta);
const method = values.method === 'cumulative' ? 'cumulative' : 'isotonic';
if (values.method !== undefined && values.method !== method) {
  process.stderr.write(`--method is isotonic or cumulative\n${USAGE}\n`);
  process.exit(64);
}
const opts = { target: Number(values.target ?? 0.99), minPoints: Number(values['min-points'] ?? 10), method } as const;
const route = opt(values, 'route') ?? 'openrouter.ai';
const date = new Date().toISOString().slice(0, 10);
const textOnly = values['text-only'] === true;
const floorPath = opt(values, 'floor');
const floorEntries: ShippedEntry[] = floorPath === undefined ? [] : (JSON.parse(readFileSync(floorPath, 'utf8')) as { entries: ShippedEntry[] }).entries;

const sameKey = (entry: CalibrationEntry, site: SiteId) => entry.site === site && entry.provider === 'jev'
  && entry.modelFamily === KNOWN_FAMILIES.jev && entry.lineFormat === 1 && entry.wordingHash === SITES[site].wording.hash;

function entryFor(fit: SiteFit, rows: readonly RunRow[], replays: number, sets: readonly SetMeta[], model: string, native: boolean): ShippedEntry {
  const fitted: Record<string, number | null> = {};
  for (const [name, edge] of Object.entries(fit.fits)) fitted[name] = edge.value;
  return {
    site: fit.site, wordingHash: SITES[fit.site].wording.hash, lineFormat: 1, modelFamily: KNOWN_FAMILIES.jev,
    provider: 'jev', threshold: fit.threshold!, setSha256: pooledSha256(sets), n: fit.runs,
    coverageAtP99: fit.coverage ?? 0, precisionAtP99: fit.precision ?? 0, date,
    provenance: {
      source: opt(values, 'source') ?? (native ? nativeSource(sets) : SOURCE), set: sets.map((meta) => meta.set).join(', '),
      items: fit.items, runs: fit.runs, orders: new Set(rows.map((row) => row.salt)).size, replays, model, route,
      method: `${METHODS[method]}; ${ROWS}`, target: opts.target, minPoints: opts.minPoints, fitted, acted: fit.acted,
      correct: fit.correct, wilsonLow: fit.wilsonLow,
    },
  };
}

/** Every file's rows, grouped by the site they answer; a file holds one site's runs. */
const bySite = new Map<SiteId, { file: string; rows: RunRow[] }[]>();
const leftOut = new Map<SiteId, number>();
for (const file of runFiles) {
  const all = readJsonl<RunRow>(file);
  const site = all[0]?.site as SiteId | undefined;
  if (site === undefined) throw new Error(`${file} holds no runs`);
  if (all.some((row) => row.site !== site)) throw new Error(`${file} mixes sites; a runs file holds one site`);
  const rows = textOnly ? all.filter((row) => row.visualOnly !== true) : all;
  leftOut.set(site, (leftOut.get(site) ?? 0) + all.filter((row) => row.status === 'ok').length - rows.filter((row) => row.status === 'ok').length);
  bySite.set(site, [...(bySite.get(site) ?? []), { file, rows }]);
}

const fresh: CalibrationEntry[] = [];
const refit = new Set<string>();
for (const [site, replays] of bySite) {
  const sets = metas.filter((m) => m.site === site);
  if (sets.length === 0) throw new Error(`no --metas file for site ${site}`);
  const native = sets.every((m) => m.native !== undefined);
  if (!native && sets.some((m) => m.native !== undefined)) throw new Error(`${site}: converted and Orca-native sets do not pool`);
  const rows = replays.flatMap((replay) => replay.rows);
  const answered = rows.filter((row) => row.status === 'ok');
  const models = [...new Set(answered.map((row) => row.model ?? ''))];
  if (models.length !== 1 || familyOf(models[0]!) !== KNOWN_FAMILIES.jev) {
    throw new Error(`${site}: answered by ${models.join(', ')}; a fit needs one model of family ${KNOWN_FAMILIES.jev}`);
  }
  const floor = native ? floorEntries.find((entry) => sameKey(entry, site)) : undefined;
  const siteOpts = { ...opts, native, ...(floor === undefined ? {} : { floor: floor.threshold }) };
  const fit = fitSite(site, rows, siteOpts);
  const perReplay = replays.length < 2 ? undefined
    : replays.map((replay) => ({ file: replay.file, rows: fitSite(site, replay.rows, siteOpts).rows }));
  const visualOnlyLeftOut = leftOut.get(site) ?? 0;
  // A replay is one run of the items with its own calls; a native site pools one file per set per replay.
  const filesPerSet = new Map<string, number>();
  for (const replay of replays) {
    for (const set of new Set(replay.rows.map((row) => row.set ?? ''))) filesPerSet.set(set, (filesPerSet.get(set) ?? 0) + 1);
  }
  const replayCount = Math.max(1, ...filesPerSet.values());
  process.stdout.write(`${JSON.stringify({ ...fit, replays: replayCount, visualOnlyLeftOut, floor: floor?.threshold ?? null, ...(perReplay ? { perReplay } : {}) })}\n`);
  if (!native) {
    refit.add(`${site}\u0000${SITES[site].wording.hash}`);
    if (fit.threshold !== null) fresh.push(entryFor(fit, answered, replayCount, sets, models[0]!, false));
    continue;
  }
  const summary = nativeSummary(fit, answered, sets, { replays: replayCount, visualOnlyLeftOut, model: models[0]!, route, date });
  if (fit.threshold === null && floor === undefined) continue;
  refit.add(`${site}\u0000${SITES[site].wording.hash}`);
  if (floor !== undefined && (fit.threshold === null || JSON.stringify(fit.threshold) === JSON.stringify(floor.threshold))) {
    // The shipped entry stands: the native fit gave no row, or no tighter one. Its reading goes beside it.
    fresh.push({ ...floor, provenance: { ...floor.provenance, native: summary } } as ShippedEntry);
    continue;
  }
  const entry = entryFor(fit, answered, replayCount, sets, models[0]!, true);
  entry.provenance.native = summary;
  if (floor !== undefined) entry.provenance.floor = { threshold: floor.threshold, set: floor.provenance.set, n: floor.n, date: floor.date };
  fresh.push(entry);
}

const writePath = opt(values, 'write');
if (writePath !== undefined) {
  const current = JSON.parse(readFileSync(writePath, 'utf8')) as { version: number; entries: CalibrationEntry[] };
  const kept = current.entries.filter((entry) => !(entry.provider === 'jev' && entry.modelFamily === KNOWN_FAMILIES.jev
    && entry.lineFormat === 1 && refit.has(`${entry.site}\u0000${entry.wordingHash}`)));
  const order = Object.keys(SITES);
  const entries = [...kept, ...fresh].sort((a, b) => order.indexOf(a.site) - order.indexOf(b.site));
  writeFileSync(writePath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  process.stderr.write(`wrote ${entries.length} entries to ${writePath} (${fresh.length} fitted now)\n`);
}
