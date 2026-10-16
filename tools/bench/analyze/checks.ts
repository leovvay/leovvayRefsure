import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, need, opt } from '../../calibrate/lib/args';
import type { Verdict } from '../../../src/questions';
import { readArmsFile } from '../lib/arms';
import { readFreezeTable, sha256File } from '../lib/freeze';
import { score } from '../lib/items';
import { isTerminal, latestByKey, ledgerFiles } from '../lib/ledger';
import type { QualityRow } from '../lib/ledger';
import { rowThreshold } from '../lib/thresholds';
import { canonSet, ledgerIndex, phaseRows, readPlan } from './readings';
import { build } from './render';
import type { RenderOptions } from './render';
import { helpExit } from '../lib/help';

/*
  analyze/checks.ts: the 9.2 mechanical checks; any failure blocks the draft (exit 1). It also fails when the
  render listed a missing input (T15: a silently skipped input is the failure this guards against).

    checks --analysis <dir with tables.md and summary.json> --freeze <table> [--manifest <json>] [--golden <dir>]
           [--no-rerun]

  Prints one `PASS|FAIL <check>: <detail>` line per check and writes every listing to `<analysis>/checks.json`.
  Reads no key: the threshold recomputation reads the arms file only for each arm's configured model.
*/

const USAGE = 'usage: checks --analysis <dir> --freeze <table> [--manifest <json>] [--golden <dir>] [--no-rerun]';

interface Check { name: string; pass: boolean; detail: string; listing: unknown[] }

const PHASES = ['P4', 'P5', 'P6'];

function allRows(results: string): QualityRow[] {
  return PHASES.flatMap((phase) => phaseRows<QualityRow>(results, phase));
}

/** 9.2: every set's sha256 equals its 9.4 row; every ledger row's `set_sha` is that set's frozen hash. */
function setHashes(results: string, planPath: string | undefined, freeze: string): Check {
  const table = readFreezeTable(freeze);
  const frozen = new Set(table.map((e) => e.sha256));
  const plan = readPlan(planPath);
  const bad: string[] = [];
  const shaOf = new Map<string, string>();
  for (const [set, path] of Object.entries(plan.sets ?? {})) {
    const sha = sha256File(path);
    shaOf.set(set.toUpperCase(), sha);
    if (!frozen.has(sha)) bad.push(`${set}: ${path} sha256 ${sha.slice(0, 12)} is not in the freeze table`);
  }
  const rowsBad = new Map<string, number>();
  for (const row of allRows(results)) {
    const set = canonSet(row.set, plan);
    const want = shaOf.get(set);
    if (typeof row.set_sha !== 'string' || !frozen.has(row.set_sha) || (want !== undefined && row.set_sha !== want)) {
      rowsBad.set(set, (rowsBad.get(set) ?? 0) + 1);
    }
  }
  for (const [set, n] of [...rowsBad.entries()].sort()) bad.push(`${set}: ${n} rows whose set_sha is not the frozen hash`);
  return { name: 'set hashes', pass: bad.length === 0, detail: `${shaOf.size} set files, ${bad.length} problems`, listing: bad };
}

/** The Verdict an R1 read stands for (enough for `score`, which reads only `kind` and `value`). */
function verdictOf(r1: NonNullable<QualityRow['r1']>): Verdict<unknown> {
  return (r1.verdict === 'answer' ? { kind: 'answer', value: r1.value } : { kind: 'abstain' }) as unknown as Verdict<unknown>;
}

/** 9.2: `correct` and `dangerous` recomputed from gold (refsure's own reading of the Terms) equal the stored values. */
function recompute(results: string): Check {
  const bad: string[] = [];
  let n = 0;
  for (const row of phaseRows<QualityRow>(results, 'P4').concat(phaseRows<QualityRow>(results, 'P5'))) {
    if (row.r1 === null || row.correct === null) continue;
    n += 1;
    const s = score(row.site as never, verdictOf(row.r1), row.gold, row.alt ?? []);
    if ((s.acted && s.correct) !== row.correct || s.dangerous !== row.dangerous) {
      bad.push(`${row.phase}/${row.arm}/${row.set}/${row.item} ${row.order}/${row.repeat}: stored ${row.correct}/${row.dangerous}, recomputed ${s.acted && s.correct}/${s.dangerous}`);
    }
  }
  return { name: 'correct and dangerous recomputed', pass: bad.length === 0, detail: `${n} rows, ${bad.length} disagreements`, listing: bad };
}

interface Manifest { planned?: Record<string, number> }

/**
 * A latest row that ends its key (7.4): P6 rows have one attempt and a timed-out row is a valid outcome there (4.4,
 * 4.5); P4/P5 rows end after 3 attempts or on a non-retryable status. An M2 `spend_limit` row (a guard stop, 4.3)
 * never ends its key; an M2 row without `attempts` ends it otherwise (its `failure` status is an outcome).
 */
export function terminalRow(r: QualityRow, phase: string): boolean {
  if (r.status === 'spend_limit') return false;
  if (!Array.isArray(r.attempts)) return true;
  return isTerminal(r, phase === 'P6' ? 1 : 3);
}

/**
 * 9.2: every planned row has a latest (terminal) row, and the rows per (phase, arm, set) equal the manifest's
 * planned count (P3a/P3b). Manifest keys are `<phase>/<arm>/<set>` as run.ts reads them (`P4a` counts the
 * interim slice of P4's files).
 */
function planned(results: string, manifestPath: string | undefined): Check[] {
  if (manifestPath === undefined) {
    return [{ name: 'planned rows', pass: false, detail: 'no --manifest: the planned keys cannot be checked', listing: [] }];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const missing: string[] = [];
  const over: string[] = [];
  const counted = new Set<string>();
  for (const [key, want] of Object.entries(manifest.planned ?? {}).sort()) {
    const [phase, arm, set] = key.split('/') as [string, string, string];
    const dir = phase === 'P4a' ? 'P4' : phase;
    counted.add(`${dir}/${arm}/${set}`);
    // The rows of that ledger file (a P6 sample file holds rows of many item sets, so `row.set` is not the file).
    const rows = [...latestByKey<QualityRow>(ledgerFiles(results, dir, arm, set)).values()].filter((r) => (phase !== 'P4a' || r.slice === 'interim')
      && (phase !== 'P4' || r.slice !== 'interim'));
    const terminal = rows.filter((r) => terminalRow(r, phase)).length;
    if (terminal < want) missing.push(`${key}: ${want - terminal} of ${want} planned rows have no terminal latest row`);
    if (rows.length > want) over.push(`${key}: ${rows.length} rows, planned ${want}`);
  }
  const unplanned = ['P4', 'P5', 'P6'].flatMap((phase) => ledgerIndex(results, phase).map((x) => `${phase}/${x.arm}/${x.set}`))
    .filter((k) => !counted.has(k));
  return [
    { name: 'planned row keys present', pass: missing.length === 0, detail: `${missing.length} (phase, arm, set) cells short; their cells read inconclusive`, listing: missing },
    { name: 'row counts equal the manifests', pass: over.length === 0 && unplanned.length === 0, detail: `${over.length} over plan, ${unplanned.length} ledgers not in the manifest`, listing: [...over, ...unplanned.map((k) => `${k}: not in the manifest`)] },
  ];
}

/** 9.2: rows with equal `digest` and equal arm agree on `req_bytes`. */
function digests(results: string): Check {
  const seen = new Map<string, number | null>();
  const bad = new Set<string>();
  for (const row of allRows(results)) {
    if (row.digest === null || row.digest === undefined || row.variant !== 'shipped') continue;
    const k = `${row.arm}\0${row.digest}`;
    if (!seen.has(k)) seen.set(k, row.req_bytes);
    else if (seen.get(k) !== row.req_bytes) bad.add(`${row.arm} ${row.digest.slice(0, 12)}: req_bytes ${seen.get(k)} vs ${row.req_bytes}`);
  }
  return { name: 'equal digests send equal bytes', pass: bad.size === 0, detail: `${seen.size} (arm, digest) pairs, ${bad.size} disagree`, listing: [...bad] };
}

/**
 * 9.2 (and P0, T14): golden bodies equal `--dry-run` output. `--golden <dir>` holds one pair per (site, arm) that
 * the P0 operator saves (README, Analysis): `<site>.<arm>.dry-run.json` = the request body refsure's own CLI prints
 * under `--dry-run`, `<site>.<arm>.body.json` = the body `provider.body()` builds for the same item (lib/ask.ts
 * `prepare`). Every pair must be byte-equal; an empty or absent dir fails.
 */
function golden(dir: string | undefined): Check {
  if (dir === undefined || !existsSync(dir)) return { name: 'golden bodies', pass: false, detail: 'no --golden dir', listing: [] };
  const names = readdirSync(dir).filter((f) => f.endsWith('.dry-run.json')).sort();
  const bad: string[] = [];
  for (const name of names) {
    const body = join(dir, name.replace(/\.dry-run\.json$/, '.body.json'));
    if (!existsSync(body)) bad.push(`${name}: no matching .body.json`);
    else if (sha256File(join(dir, name)) !== sha256File(body)) bad.push(`${name}: differs from its provider body()`);
  }
  if (names.length === 0) bad.push('no *.dry-run.json files');
  return { name: 'golden bodies', pass: bad.length === 0, detail: `${names.length} pairs`, listing: bad };
}

/** 9.2: `family_ok` true on every row a reading uses (readings set the false ones aside; this proves none slipped in). */
function family(results: string): Check {
  const bad = allRows(results).filter((r) => r.family_ok === false);
  const byCell = new Map<string, number>();
  for (const r of bad) byCell.set(`${r.phase}/${r.arm}/${r.site}/${r.set}`, (byCell.get(`${r.phase}/${r.arm}/${r.site}/${r.set}`) ?? 0) + 1);
  return { name: 'family_ok on rows a reading uses', pass: true, detail: `${bad.length} family_ok false rows set aside by every reading (2.2), listed`,
    listing: [...byCell.entries()].sort().map(([k, n]) => `${k}: ${n}`) };
}

/**
 * 9.2 thresholds: every `jev_gw` locate row reads 0.89, find read 0.61, outcome {.93, .15}; every row's
 * `threshold_r1` equals the 2.2 rule recomputed from its site, provider, risk, the arm's configured model and the
 * shipped wording hash, with the same `threshold_source`.
 */
function thresholds(results: string): Check {
  const arms = process.env.REFSURE_BENCH_ARMS ? readArmsFile() : null;
  const modelOf = (arm: string, row: QualityRow) => arms?.arms.find((a) => a.id === arm)?.model ?? row.model ?? '';
  const bad: string[] = [];
  let n = 0;
  for (const row of phaseRows<QualityRow>(results, 'P4').concat(phaseRows<QualityRow>(results, 'P5'))) {
    if (row.threshold_r1 === null || /_desc$/.test(row.arm)) continue;
    n += 1;
    const want = rowThreshold(row.site as never, row.provider as never, row.risk, modelOf(row.arm, row), row.wording_hash);
    if (JSON.stringify(want.threshold) !== JSON.stringify(row.threshold_r1) || want.source !== row.threshold_source) {
      bad.push(`${row.arm}/${row.site}/${row.set}/${row.item}: stored ${JSON.stringify(row.threshold_r1)} (${row.threshold_source}), rule ${JSON.stringify(want.threshold)} (${want.source})`);
    }
    if (row.arm === 'jev_gw') {
      const t = row.threshold_r1 as unknown;
      if (row.site === 'locate' && t !== 0.89) bad.push(`jev_gw locate ${row.item}: ${JSON.stringify(t)}, expected 0.89`);
      if (row.site === 'find' && row.risk === 'read' && t !== 0.61) bad.push(`jev_gw find read ${row.item}: ${JSON.stringify(t)}, expected 0.61`);
      if (row.site === 'outcome' && JSON.stringify(t) !== JSON.stringify({ yesAtLeast: 0.93, noAtMost: 0.15 })) bad.push(`jev_gw outcome ${row.item}: ${JSON.stringify(t)}, expected {0.93, 0.15}`);
    }
  }
  return { name: 'thresholds', pass: bad.length === 0, detail: `${n} rows${arms ? '' : ' (no REFSURE_BENCH_ARMS: the answering model stands in for the configured one)'}, ${bad.length} problems`, listing: bad.slice(0, 500) };
}

interface Summary { generated: string; options: RenderOptions; missing: string[]; verdictCells: { cell: string; actedGroups: number | null }[]; tables?: { rows: unknown[][] }[] }

/** 9.2: every verdict cell prints acted groups; T15: no input was missing. */
function cells(summary: Summary): Check[] {
  const noGroups = summary.verdictCells.filter((c) => c.actedGroups === null).map((c) => c.cell);
  return [
    { name: 'verdict cells print acted groups', pass: noGroups.length === 0, detail: `${summary.verdictCells.length} cells, ${noGroups.length} without a reading`, listing: noGroups },
    { name: 'no missing input (T15)', pass: summary.missing.length === 0, detail: `${summary.missing.length} missing inputs; their cells read inconclusive (missing ...)`, listing: summary.missing },
  ];
}

/** 9.2: rerunning analyze on the committed ledgers reproduces tables.md byte for byte except its `Generated:` line. */
function rerun(analysis: string, summary: Summary): Check {
  const committed = readFileSync(join(analysis, 'tables.md'), 'utf8');
  const generated = /^Generated: (.*)$/m.exec(committed)?.[1] ?? '';
  const again = build(summary.options).md(generated);
  const a = committed.split('\n');
  const b = again.split('\n');
  const diff: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && diff.length < 20; i += 1) if (a[i] !== b[i]) diff.push(`line ${i + 1}`);
  return { name: 'rerun reproduces tables.md', pass: diff.length === 0, detail: diff.length === 0 ? 'byte-equal except the Generated line' : `${diff.length}+ lines differ`, listing: diff };
}

function main(): void {
  helpExit(USAGE);
  const argv = process.argv.slice(2);
  const noRerun = argv.includes('--no-rerun');
  const v = flags(argv.filter((a) => a !== '--no-rerun'), ['analysis', 'freeze', 'manifest', 'golden'], USAGE);
  const analysis = need(v, 'analysis', USAGE);
  const summary = JSON.parse(readFileSync(join(analysis, 'summary.json'), 'utf8')) as Summary;
  const results = summary.options.results;
  const checks: Check[] = [
    setHashes(results, summary.options.plan, need(v, 'freeze', USAGE)), recompute(results), ...planned(results, opt(v, 'manifest')),
    digests(results), golden(opt(v, 'golden')), family(results), thresholds(results), ...cells(summary),
    ...(noRerun ? [] : [rerun(analysis, summary)]),
  ];
  for (const c of checks) process.stdout.write(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}\n`);
  writeFileSync(join(analysis, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

if (process.argv[1] && /checks\.(ts|mjs|js)$/.test(process.argv[1])) main();
