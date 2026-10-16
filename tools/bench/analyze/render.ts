import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, need, num, opt } from '../../calibrate/lib/args';
import { readArmsFile } from '../lib/arms';
import { armRuntime, prepare } from '../lib/ask';
import { isCandidateSite, readItems } from '../lib/items';
import type { QualityRow } from '../lib/ledger';
import { agentTable, e2eTables, firstExisting, slowGateway } from './levels';
import { canonSet as canonSetOf, comboRows, comboUnit, isUnitRow, phaseRows, readGates, readMeta, readPlan, timingRows, toUnit } from './readings';
import type { ItemFacts, Plan } from './readings';
import { analyze } from './report';
import type { Cell, DriftBodies, Inputs, Report, Table } from './verdict';
import { helpExit } from '../lib/help';

/*
  analyze/render.ts: reads the committed ledgers (P4, P5, P6, combos, P5b gates) and writes `tables.md` and
  `summary.json` (9.1: every report number is copied from these). Deterministic: the bootstrap is seeded and every
  table is sorted, so a rerun reproduces `tables.md` byte for byte except its `Generated:` line (9.2). With
  `--interim` it reads only P4a rows (`slice: interim`) of P4 into `<out>/interim/` (7.1): P4a tables are titled
  `interim:`, a table read wholly from P6, P7 or P8 rows is titled with that phase, and P6-read columns are noted.

    render --results <dir> --out <analysis dir> [--plan <plan.json>] [--interim] [--crosscheck <json>]
           [--agent-readings <agent-readings.json>] [--pii-egress] [--resamples 2000]

  Sections 7 and 8: Q15 from the P7 ledger `<results>/e2e/cli/runs*.jsonl`, read on the A6 item 5 re-grade with the
  recorded grade beside it (analyze/regrade.ts; the ledger is never edited); Q16 from agent/score.ts's
  `agent-readings.json` (`--agent-readings`, else `<out>/agent-readings.json`, else `<results>/P8/scored/agent-readings.json`,
  where p8/run.sh's score step writes it and A6 keeps it, else `<results>/P8/agent-readings.json`).

  Exit 0 written; 64 bad usage. Missing inputs do not stop the render: their cells read `inconclusive (missing
  <input>)` and are listed at the top; analyze/checks.ts fails on them.
*/

const USAGE = 'usage: render --results <dir> --out <dir> [--plan <plan.json>] [--interim] [--crosscheck <json>] [--agent-readings <json>] [--pii-egress] [--resamples 2000]';

/** The 2.5 drift body listings run.ts writes beside the P5 ledgers (`<results>/P5/drift-bodies.<set>.json`), by file name. */
export function readDriftBodies(results: string): DriftBodies[] {
  const dir = join(results, 'P5');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^drift-bodies\..+\.json$/.test(f)).sort()
    .map((f) => ({ file: f, listing: JSON.parse(readFileSync(join(dir, f), 'utf8')) as DriftBodies['listing'] }));
}

/** Every input the rules read, from the results dir. `interim` keeps P4a rows only. */
export function loadInputs(results: string, plan: Plan, opts: { interim: boolean; resamples: number }): Inputs {
  const p4all = phaseRows<QualityRow>(results, 'P4');
  const p4 = p4all.filter((r) => !opts.interim || r.slice === 'interim');
  const shipped = p4.filter((r) => r.variant === 'shipped');
  const units = shipped.filter((r) => isUnitRow(r)).map((r) => toUnit(r, plan));
  const p5 = phaseRows<QualityRow>(results, 'P5').map((r) => ({
    ...toUnit(r, plan), variant: r.variant, repeat: r.repeat, order: r.order, raw: r as unknown as Record<string, unknown>,
  }));
  const combos = comboRows(results);
  // A combo row does not carry visual_only, origin, lang, condition or masks: its single-arm unit rows of the same item do.
  const facts = new Map<string, ItemFacts>(p4all.filter((r) => isUnitRow(r)).map((r) => toUnit(r, plan))
    .map((u) => [u.key, { visualOnly: u.visualOnly, origin: u.origin, lang: u.lang, condition: u.condition, masks: u.masks }]));
  const comboUnits = combos.rows.map((row) => comboUnit(row, plan, facts.get(`${canonSetOf(row.set, plan)}:${row.item}`)));
  const comboNoFacts = combos.rows.filter((row) => !facts.has(`${canonSetOf(row.set, plan)}:${row.item}`)).length;
  const timing = timingRows(phaseRows<QualityRow & { mode?: string }>(results, 'P6') as never, plan);
  return {
    plan, meta: readMeta(plan), resamples: opts.resamples, units,
    allUnits: shipped.map((r) => toUnit(r, plan)),
    recheck: p4.filter((r) => r.variant === 'recheck').map((r) => toUnit(r, plan)),
    interimUnits: p4.filter((r) => r.slice === 'interim' && r.variant === 'shipped').map((r) => toUnit(r, plan)),
    p5, driftBodies: readDriftBodies(results), combos: comboUnits, comboDropped: combos.dropped, comboNoFacts, gates: readGates(results),
    timing: timing.rows, timingDefects: timing.defects,
  };
}

function cellText(v: Cell): string {
  if (v === null) return '-';
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** One table as markdown under its anchor. */
export function tableMd(t: Table, prefix: string): string {
  const head = `<a id="${t.anchor}"></a>\n\n### ${prefix}${t.title}\n\n`;
  const cols = `| ${t.columns.join(' | ')} |\n|${t.columns.map(() => '---').join('|')}|\n`;
  const body = t.rows.map((r) => `| ${t.columns.map((_, i) => cellText(r[i] ?? null)).join(' | ')} |`).join('\n');
  const notes = t.notes.map((n) => `- ${n}`).join('\n');
  return `${head}${t.rows.length > 0 ? `${cols}${body}\n` : '(no rows)\n'}${notes ? `\n${notes}\n` : ''}`;
}

const SECTION_TITLES: Readonly<Record<number, string>> = {
  1: 'Answers for the owner', 2: 'Per site', 3: 'Combos', 4: 'Wording ablation', 5: 'Line format v1 vs descriptor lines',
  6: 'Route, stability, safety and PII', 7: 'End-to-end CLI', 8: 'Agent level', 9: 'Cost', 10: 'Threats realised', 11: 'Reproduction',
};

/** An interim title prefix (7.1): `interim:` on P4a tables; a table read wholly from another phase names that phase. */
function interimPrefix(source: string | undefined): string {
  return source === undefined ? 'interim: ' : `from ${source} (not P4a rows): `;
}

/** Interim notes for P4a tables that also print columns read from P6 rows (timing, the 4.4 failure share). */
const INTERIM_P6_COLUMNS: readonly [RegExp, string][] = [
  [/^site-/, 'interim: p50, p95, p95 CI, over budget and R1-budget cov read P6 rows (timing, 4.4 failure share), not P4a rows.'],
  [/^q9$/, 'interim: the p50 T_ask column reads P6 M1 rows, not P4a rows.'],
  [/^combos$/, 'interim: added p50 and p95 read P6 M2 rows, not P4a rows.'],
];

/** `tables.md`: the `Generated:` line is the only line that may differ between two renders of the same ledgers. */
export function renderMd(report: Report, generated: string, interim: boolean): string {
  const title = interim ? 'Interim readings (P4a rows; tables read from P6, P7 or P8 are labelled with that phase)' : 'Benchmark readings';
  const out = [`# ${title}`, '', `Generated: ${generated}`, ''];
  out.push(report.missing.length === 0 ? 'Missing inputs: none.' : `Missing inputs (each cell reads \`inconclusive (missing ...)\`):\n${report.missing.map((m) => `- ${m}`).join('\n')}`, '');
  for (const section of [...new Set(report.tables.map((t) => t.section))].sort((a, b) => a - b)) {
    const tables = report.tables.filter((x) => x.section === section);
    const sources = [...new Set(tables.map((t) => t.source))];
    const prefix = !interim ? '' : interimPrefix(sources.length === 1 ? sources[0] : undefined);
    out.push(`## ${section}. ${prefix}${SECTION_TITLES[section] ?? ''}`, '');
    for (const t of tables) out.push(tableMd(t, interim ? interimPrefix(t.source) : ''));
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** 9.1 item 10: which section 8 handlings fired, from guard lines and row flags. */
function threatsTable(results: string, inputs: Inputs): Table {
  const rows: Cell[][] = [];
  for (const phase of ['P4', 'P5', 'P5b', 'P6', 'P7', 'P8']) {
    const path = join(results, phase, 'guards.jsonl');
    if (!existsSync(path)) continue;
    const counts = new Map<string, number>();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      try { const g = JSON.parse(line) as { guard?: string; action?: string }; const k = `${g.guard ?? '?'}: ${g.action ?? ''}`; counts.set(k, (counts.get(k) ?? 0) + 1); } catch { /* a killed run's last line */ }
    }
    for (const [k, n] of [...counts.entries()].sort()) rows.push([phase, 'guard', k, n]);
  }
  const flagCount = new Map<string, number>();
  for (const u of inputs.allUnits) for (const f of u.flags) flagCount.set(f, (flagCount.get(f) ?? 0) + 1);
  for (const r of inputs.timing) for (const f of r.flags) flagCount.set(`P6 ${f}`, (flagCount.get(`P6 ${f}`) ?? 0) + 1);
  for (const [k, n] of [...flagCount.entries()].sort()) rows.push(['rows', 'flag', k, n]);
  rows.push(['P4', 'family_ok false (excluded)', null, inputs.allUnits.filter((u) => u.familyBad).length]);
  rows.push(['P6', 'cache-served rows (excluded)', null, inputs.timing.filter((r) => r.cacheHit).length]);
  rows.push(['P6', 'bench defects (spend_limit, unrefused)', null, inputs.timingDefects]);
  return { anchor: 'threats', section: 10, title: 'Threats realised (section 8 handlings that fired)', columns: ['phase', 'kind', 'what', 'count'], rows,
    notes: ['Amendments made after results existed are listed in PROTOCOL 9.5 with both readings.'] };
}

/** 9.1 item 11: the commits, set hashes and arms-file hash every row recorded. */
function reproductionTable(results: string): Table {
  const seen = new Map<string, Set<string>>();
  for (const phase of ['P4', 'P5', 'P6']) {
    for (const r of phaseRows<QualityRow>(results, phase)) {
      for (const [k, v] of [['refsure_commit', r.refsure_commit], ['bench_commit', r.bench_commit], ['arms_sha', r.arms_sha], [`set_sha ${r.set}`, r.set_sha]] as const) {
        if (typeof v !== 'string') continue;
        seen.set(k, (seen.get(k) ?? new Set()).add(v));
      }
    }
  }
  const rows: Cell[][] = [...seen.entries()].sort().map(([k, v]) => [k, [...v].sort().join(', ')]);
  return { anchor: 'reproduction', section: 11, title: 'Reproduction: commits and hashes', columns: ['field', 'values'], rows,
    notes: ['Analysis reads committed ledgers only and needs no credentials: `node render.mjs --results <dir> --out <dir> --plan <plan.json>`.'] };
}

/**
 * Q11's egress byte check, offline: every masks-on item of the PII sets (N10, S4 in the plan) built and approved
 * through refsure's own pipeline for each `data: all` arm (lib/ask.ts `prepare`, no network, no key read), and its
 * exact wire body searched for every source string the item lists in `pii`. Any hit is a defect, listed.
 */
export function piiEgress(plan: Plan): { checked: number; hits: string[]; unlisted: string[] } {
  const arms = readArmsFile();
  const hits: string[] = [];
  const unlisted: string[] = [];
  let checked = 0;
  const runtimes = new Map<string, ReturnType<typeof armRuntime>>();
  // `pii` (masked source strings) from the item metadata; an item without it is counted, never read as clean.
  const meta = readMeta(plan);
  for (const set of ['N10', 'S4']) {
    const path = Object.entries(plan.sets ?? {}).find(([id]) => canonSetOf(id, plan) === set)?.[1];
    if (path === undefined) { unlisted.push(`${set}: no set file in the plan`); continue; }
    let without = 0;
    for (const item of readItems(path).filter((x) => x.masks !== false)) {
      const pii = meta.get(`${set}:${item.id}`)?.pii;
      if (!Array.isArray(pii) || pii.length === 0) { without += 1; continue; }
      for (const arm of arms.arms.filter((a) => a.data === 'all')) {
        const rt = runtimes.get(arm.id) ?? runtimes.set(arm.id, armRuntime(arms, arm)).get(arm.id)!;
        const p = prepare(rt, item, isCandidateSite(item.site) ? 'p0' : 'fixed');
        if (p.body === null) continue;
        checked += 1;
        const body = JSON.stringify(p.body);
        // Only the count and the item id are printed, never the matched string.
        if (pii.some((text) => typeof text === 'string' && text !== '' && body.includes(text))) hits.push(`${set}:${item.id} (${arm.id})`);
      }
    }
    if (without > 0) unlisted.push(`${set}: ${without} masks-on items list no masked source strings (not checked)`);
  }
  return { checked, hits, unlisted };
}

/** What one render read; stored in summary.json so analyze/checks.ts can rerun it exactly (9.2). */
export interface RenderOptions { results: string; outBase: string; plan?: string; interim: boolean; pii: boolean; crosscheck?: string; agentReadings?: string; resamples: number }

/** Reads every input and computes the report; `md(generated)` renders tables.md. */
export function build(o: RenderOptions): { report: Report; md: (generated: string) => string } {
  const plan = readPlan(o.plan);
  const inputs = loadInputs(o.results, plan, { interim: o.interim, resamples: o.resamples });
  const crossPath = o.crosscheck ?? join(o.outBase, 'spend-crosscheck.json');
  const crosscheck = existsSync(crossPath) ? (JSON.parse(readFileSync(crossPath, 'utf8')) as Record<string, unknown>) : null;
  const report = analyze(inputs, { egress: o.pii ? piiEgress(plan) : null, crosscheck: crosscheck === null ? null : { summary: crosscheck.summary ?? crosscheck } });
  const extraMissing: string[] = [];
  if ((inputs.comboNoFacts ?? 0) > 0) extraMissing.push(`single-arm unit rows (item facts) for ${inputs.comboNoFacts} combo unit rows`);
  const agentPath = firstExisting(o.agentReadings, join(o.outBase, 'agent-readings.json'),
    join(o.results, 'P8', 'scored', 'agent-readings.json'), join(o.results, 'P8', 'agent-readings.json'));
  report.tables.push(...e2eTables(o.results, extraMissing), agentTable(agentPath, extraMissing), threatsTable(o.results, inputs), reproductionTable(o.results));
  const slow = slowGateway(o.results);
  report.tables.find((t) => t.anchor === 'q13')?.notes.push(slow === null ? 'P6 end-RTT check (4.5): not recorded (P6/phase.jsonl)'
    : `P6 end-RTT check (4.5): ${slow ? 'slow_gateway: the end RTT was above 1.5x the P0 baseline; read every cell with that note' : 'within 1.5x of P0'}`);
  if (o.interim) {
    for (const t of report.tables) for (const [anchor, note] of INTERIM_P6_COLUMNS) if (anchor.test(t.anchor)) t.notes.push(note);
  }
  report.missing.push(...extraMissing);
  if (o.resamples !== 2000) report.missing.push(`protocol resamples (this render used ${o.resamples}, not 2,000)`);
  report.missing.sort();
  report.tables.sort((a, b) => a.section - b.section);
  return { report, md: (generated) => renderMd(report, generated, o.interim) };
}

function main(): void {
  helpExit(USAGE);
  const argv = process.argv.slice(2);
  const interim = argv.includes('--interim');
  const pii = argv.includes('--pii-egress');
  const v = flags(argv.filter((a) => a !== '--interim' && a !== '--pii-egress'), ['results', 'out', 'plan', 'crosscheck', 'agent-readings', 'resamples'], USAGE);
  const outBase = need(v, 'out', USAGE);
  const planPath = opt(v, 'plan');
  // A missing cell input reads `inconclusive (missing ...)`; a missing results dir or plan file is a wrong path.
  for (const [flag, path] of [['results', need(v, 'results', USAGE)], ['plan', planPath], ['crosscheck', opt(v, 'crosscheck')], ['agent-readings', opt(v, 'agent-readings')]] as const) {
    if (path !== undefined && !existsSync(path)) { process.stderr.write(`--${flag} ${path}: no such file or directory\n${USAGE}\n`); process.exit(64); }
  }
  const o: RenderOptions = {
    results: need(v, 'results', USAGE), outBase, interim, pii, resamples: num(v, 'resamples', readPlan(planPath).resamples ?? 2000, USAGE, { min: 0, integer: true }),
    ...(planPath === undefined ? {} : { plan: planPath }), ...(opt(v, 'crosscheck') === undefined ? {} : { crosscheck: opt(v, 'crosscheck')! }),
    ...(opt(v, 'agent-readings') === undefined ? {} : { agentReadings: opt(v, 'agent-readings')! }),
  };
  const out = interim ? join(outBase, 'interim') : outBase;
  mkdirSync(out, { recursive: true });
  const { report, md } = build(o);
  const generated = new Date().toISOString();
  writeFileSync(join(out, 'tables.md'), md(generated));
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ generated, options: o, ...report }, null, 2)}\n`);
  process.stdout.write(`${join(out, 'tables.md')}: ${report.tables.length} tables, ${report.missing.length} missing inputs\n`);
}

if (process.argv[1] && /render\.(ts|mjs|js)$/.test(process.argv[1])) main();
