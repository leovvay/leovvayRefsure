import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestByKey, ledgerFiles } from '../lib/ledger';
import type { QualityRow } from '../lib/ledger';
import { BENCH_SEED, holm, nearestRank, orderStatisticCi, seeded } from '../lib/stats';
import { M2_ROUTES, m2Arm } from './decision';
import type { DecisionRow } from './decision';
import type { TimingSample } from './sample';

/*
  4.4 readings and the 4.5 exit check from the P6 ledgers. Sends nothing. A cell is (mode, arm or route, site); its
  endpoint is `T_ask` (M1) or `T_decision` (M2). Rows served from a response cache are excluded and counted; rows
  with `family_ok` false (any part, M2) are excluded and counted, and above 1% of a cell they make it
  `inconclusive (family)` (2.2, A1); a row without an answer (timeout, transport or HTTP failure) ranks +inf;
  refusal and invalid rows keep their measured time. An M1 row refused before sending (`refused:<cause>`, an
  abstain for 2.1) has no measured time: it is counted as `refused` and left out of the percentiles. Every reading uses all rows; the reading without `high_load`, `slow_gateway` and
  `slow_window` rows is printed beside it. `slow_window` comes from the latency guard's [from, to] spans.
*/

const PHASE = 'P6';
const BUDGET_MS = 5_000;
const FALLBACK_DECISION_MS = 10_000;
const FAIL = /^(timeout|transport|http_\d+)$/;
const SENSITIVE = new Set(['high_load', 'slow_gateway', 'slow_window']);
/** +inf stands in as this value inside bootstrap differences, so inf - inf is 0, not NaN. */
const SENTINEL = 1e9;

/** One P6 row reduced to what the readings need. */
export interface TimingRow {
  mode: 'M1' | 'M2'; arm: string; route: string | null; site: string; item: string; group: string; repeat: string; rowIndex: number;
  /** The endpoint's measured ms (null when nothing was sent). */
  time: number | null;
  /** No answer: ranks +inf. */
  noAnswer: boolean;
  /** M1 refused before sending (no attempt, no time): an abstain, out of the percentiles. */
  refused: boolean;
  /** `family_ok` false on the row (M1) or on any part (M2): excluded from every reading (2.2). */
  familyBad: boolean;
  /** Timed out, or failed by transport or HTTP (R1-budget, 4.4). */
  failed: boolean;
  timedOut: boolean;
  cacheHit: boolean;
  cachedTokens: boolean;
  flags: string[];
  loadavg: number;
  wires: number[];
  askPlan: number | null;
  parts: { ms: number | null; timedOut: boolean }[];
  tsStart: string | null;
}

/** Fields that count tokens read from a prompt cache (`cached_tokens`, `cache_read_*`, `*cache_hit*`); never misses or writes. */
const CACHED_FIELD = /cached_tokens|cache_read|cache_hit/i;

/** Sum of every cached-token field under `usage` (nested objects included). */
export function cachedTokenCount(usage: unknown): number {
  if (typeof usage !== 'object' || usage === null) return 0;
  let total = 0;
  for (const [name, value] of Object.entries(usage)) {
    if (typeof value === 'number' && CACHED_FIELD.test(name)) total += value;
    else if (typeof value === 'object') total += cachedTokenCount(value);
  }
  return total;
}

/** The default value of a cache-hit header that means a hit. */
export const HIT_VALUE = /^(hit|true|1)$/i;

/** `--cache-hit name` or `name=<regex>`: the header and the values that mean a hit (default `^(hit|true|1)$`, any case). */
export interface CacheHitRule { name: string; value: RegExp }

export function parseCacheHit(spec: string | null): CacheHitRule | null {
  if (spec === null || spec === '') return null;
  const at = spec.indexOf('=');
  if (at === 0) throw new Error(`--cache-hit ${spec}: expected name or name=<regex>`);
  return at < 0 ? { name: spec.toLowerCase(), value: HIT_VALUE } : { name: spec.slice(0, at).toLowerCase(), value: new RegExp(spec.slice(at + 1), 'i') };
}

/** A recorded response says it came from a cache: the named header's value matches, or (no rule) a `*cache*hit*` header reads hit. */
export function hit(headers: readonly Record<string, string>[], rule: CacheHitRule | null): boolean {
  if (rule === null) return headers.some((h) => Object.entries(h).some(([k, v]) => /cache.?hit/i.test(k) && HIT_VALUE.test(v.trim())));
  return headers.some((h) => h[rule.name] !== undefined && rule.value.test(h[rule.name]!.trim()));
}

function fromM1(row: QualityRow & { mode?: string; row_index?: number }, cacheHeader: CacheHitRule | null): TimingRow {
  const attempt = row.attempts[0];
  const failed = FAIL.test(row.status);
  const refused = !attempt && !failed;
  return {
    mode: 'M1', arm: row.arm, route: null, site: row.site, item: row.item, group: row.group, repeat: row.repeat, rowIndex: row.row_index ?? -1,
    time: attempt ? attempt.t_ask : null, noAnswer: failed, refused, familyBad: row.family_ok === false, failed, timedOut: attempt?.timed_out ?? false,
    cacheHit: hit(attempt?.headers ?? [], cacheHeader), cachedTokens: (attempt?.usage ?? []).some((u) => cachedTokenCount(u) > 0),
    flags: row.flags, loadavg: row.loadavg, wires: attempt?.t_wire ?? [], askPlan: null, parts: [], tsStart: row.ts_start,
  };
}

function fromM2(row: DecisionRow, cacheHeader: CacheHitRule | null): TimingRow {
  const failed = row.status === 'failure';
  return {
    mode: 'M2', arm: row.arm, route: row.route, site: row.site, item: row.item, group: row.group, repeat: row.repeat, rowIndex: row.row_index,
    time: row.t_decision, noAnswer: failed, refused: false, failed, timedOut: row.timed_out,
    familyBad: row.family_ok === false || row.parts.some((p) => p.family_ok === false),
    cacheHit: hit(row.parts.flatMap((p) => p.headers), cacheHeader), cachedTokens: row.parts.some((p) => p.usage.some((u) => cachedTokenCount(u) > 0)),
    flags: row.flags, loadavg: row.loadavg, wires: row.parts.flatMap((p) => p.t_wire), askPlan: row.t_ask_plan,
    parts: row.parts.map((p) => ({ ms: p.t_part, timedOut: p.timed_out })), tsStart: row.ts_start,
  };
}

function jsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as T);
}

/** The latency guard's [from, to] spans (7.3): rows sent inside one are `slow_window`. */
function slowSpans(out: string): [number, number][] {
  return jsonLines<{ guard: string; value: { from?: string; to?: string } }>(join(out, PHASE, 'guards.jsonl'))
    .filter((line) => line.guard === 'latency' && line.value?.from && line.value?.to)
    .map((line) => [Date.parse(line.value.from!), Date.parse(line.value.to!)]);
}

/** Every P6 row (latest per key), cache hits included and marked. */
export function loadRows(out: string, cacheHeader: CacheHitRule | null): TimingRow[] {
  const dir = join(out, PHASE);
  if (!existsSync(dir)) return [];
  const spans = slowSpans(out);
  const rows: TimingRow[] = [];
  for (const arm of readdirSync(dir, { withFileTypes: true })) {
    if (!arm.isDirectory() || arm.name === 'state' || arm.name.startsWith('.')) continue;
    const sets = new Set(readdirSync(join(dir, arm.name)).filter((f) => /\.jsonl(\.gz)?$/.test(f)).map((f) => f.replace(/(\.resume\d+)?\.jsonl(\.gz)?$/, '')));
    for (const set of sets) {
      for (const raw of latestByKey<QualityRow & { mode?: string }>(ledgerFiles(out, PHASE, arm.name, set)).values()) {
        if ((raw as unknown as DecisionRow).status === 'spend_limit') continue;
        const row = raw.mode === 'M2' ? fromM2(raw as unknown as DecisionRow, cacheHeader) : fromM1(raw, cacheHeader);
        const at = row.tsStart ? Date.parse(row.tsStart) : Number.NaN;
        if (spans.some(([from, to]) => at >= from && at <= to) && !row.flags.includes('slow_window')) row.flags = [...row.flags, 'slow_window'];
        rows.push(row);
      }
    }
  }
  return rows;
}

/** The ranked value of a row: +inf without an answer. */
export function ranked(row: TimingRow): number {
  return row.noAnswer || row.time === null ? Number.POSITIVE_INFINITY : row.time;
}

/** A percentile as printed: ms rounded, `>5,000 (no answer)` when it lands on a row without an answer, null when there are no rows. */
export function shown(value: number): number | string | null {
  if (Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || value >= SENTINEL) return '>5,000 (no answer)';
  return Math.round(value);
}

function pct(rows: readonly TimingRow[]): { n: number; p50: number | string | null; p95: number | string | null } {
  if (rows.length === 0) return { n: 0, p50: null, p95: null };
  const values = rows.map(ranked);
  return { n: values.length, p50: shown(nearestRank(values, 0.5)), p95: shown(nearestRank(values, 0.95)) };
}

function plain(values: readonly number[]): { n: number; p50: number | null; p95: number | null } {
  return values.length === 0 ? { n: 0, p50: null, p95: null } : { n: values.length, p50: Math.round(nearestRank(values, 0.5)), p95: Math.round(nearestRank(values, 0.95)) };
}

/** Groups resampled with replacement under the seeded PRNG; `stat` gets one resample's groups. */
function bootstrapValues<T>(groups: readonly T[], stat: (sample: readonly T[]) => number, resamples = 2000, seed = BENCH_SEED): number[] {
  const random = seeded(seed);
  const values: number[] = [];
  for (let b = 0; b < resamples; b += 1) {
    const sample: T[] = [];
    for (let g = 0; g < groups.length; g += 1) sample.push(groups[Math.floor(random() * groups.length)]!);
    values.push(stat(sample));
  }
  return values.sort((a, b) => a - b);
}

function interval(values: readonly number[], alpha = 0.05): { lower: number; upper: number } {
  const pick = (q: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(q * values.length)))] ?? Number.NaN;
  return { lower: pick(alpha / 2), upper: pick(1 - alpha / 2) };
}

function capped(value: number): number {
  return Number.isFinite(value) ? value : SENTINEL;
}

function byGroup(rows: readonly TimingRow[]): TimingRow[][] {
  const map = new Map<string, TimingRow[]>();
  for (const row of rows) map.set(row.group, [...(map.get(row.group) ?? []), row]);
  return [...map.keys()].sort().map((key) => map.get(key)!);
}

/** 4.4: the p95 group-bootstrap CI (every row of a resampled group kept) and the iid order-statistic interval. */
function p95Intervals(rows: readonly TimingRow[]) {
  if (rows.length === 0) return null;
  const groups = byGroup(rows);
  const boot = interval(bootstrapValues(groups, (sample) => capped(nearestRank(sample.flat().map(ranked), 0.95))));
  const sorted = rows.map(ranked).sort((a, b) => a - b);
  const os = orderStatisticCi(sorted.length, 0.95, 0.95);
  return {
    group_bootstrap: { lower: shown(boot.lower), upper: shown(boot.upper), resamples: 2000, groups: groups.length },
    order_statistic_iid: os ? { j: os.j, k: os.k, coverage: Math.round(os.coverage * 1e4) / 1e4, lower: shown(sorted[os.j - 1]!), upper: shown(sorted[os.k - 1]!) } : null,
  };
}

export interface CellReading {
  mode: 'M1' | 'M2'; arm: string; site: string; endpoint: 'T_ask' | 'T_decision';
  planned: number; present: number; cache_excluded: number; family_excluded: number; refused: number; n: number;
  no_answer: number; no_answer_share: number; marks: string[];
  p50: number | string | null; p95: number | string | null; p95_ci: ReturnType<typeof p95Intervals>;
  over_budget: Record<string, number>; r1_budget_failure_share: number;
  t_wire: ReturnType<typeof plain>; t_ask_plan: ReturnType<typeof plain> | null; t_part: ReturnType<typeof plain> | null;
  by_repeat: { r1: ReturnType<typeof pct>; r2_r3: ReturnType<typeof pct> };
  by_cached_tokens: { yes: ReturnType<typeof pct>; no: ReturnType<typeof pct> };
  sensitivity: { without_flagged: ReturnType<typeof pct>; flagged: number; loadavg_p50: number | null; loadavg_max: number | null };
  exit: 'ok' | 'inconclusive (rows)' | 'inconclusive (family)';
  /** Every inconclusive reason of the cell (`exit` is the first, or `ok`). */
  exit_reasons: ('inconclusive (rows)' | 'inconclusive (family)')[];
  answered_or_timed_out_share: number;
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1e4) / 1e4;
}

/** Over-budget shares (4.4): single parts and `agree` against 5,000 ms; `fallback` per part and per Decision against 10,000 ms. */
function overBudget(rows: readonly TimingRow[]): Record<string, number> {
  const over = (ms: number | null, limit: number, timedOut: boolean) => timedOut || (ms !== null && ms > limit);
  if (rows[0]?.route !== 'fallback') return { decision_5000: share(rows.filter((r) => over(r.time, BUDGET_MS, r.timedOut)).length, rows.length) };
  const parts = rows.flatMap((r) => r.parts);
  return {
    per_part_5000: share(parts.filter((p) => over(p.ms, BUDGET_MS, p.timedOut)).length, parts.length),
    per_decision_10000: share(rows.filter((r) => over(r.time, FALLBACK_DECISION_MS, false)).length, rows.length),
  };
}

/** Rows a reading uses: not a cache hit, `family_ok` not false, and sent (an M1 refusal has no time). */
export function measured(rows: readonly TimingRow[]): TimingRow[] {
  return rows.filter((r) => !r.cacheHit && !r.familyBad && !r.refused);
}

/** One cell's 4.4 readings and its 4.5 row check. `all` holds the cell's rows, cache hits included. */
export function cellReading(all: readonly TimingRow[], planned: number): CellReading {
  const first = all[0]!;
  const uncached = all.filter((r) => !r.cacheHit);
  const familyBad = uncached.filter((r) => r.familyBad).length;
  const kept = uncached.filter((r) => !r.familyBad);
  const refused = kept.filter((r) => r.refused).length;
  const rows = kept.filter((r) => !r.refused);
  const noAnswer = rows.filter((r) => r.noAnswer).length;
  const flagged = rows.filter((r) => r.flags.some((f) => SENSITIVE.has(f)));
  const loads = rows.map((r) => r.loadavg);
  // 4.5: a refused row is an outcome (an abstain); cache-hit and family-excluded rows count against the 95%.
  const answeredOrTimedOut = kept.filter((r) => r.refused || !r.noAnswer || r.timedOut).length;
  const okShare = share(answeredOrTimedOut, planned);
  const marks = share(noAnswer, rows.length) > 0.02 ? ['failures'] : [];
  const reasons: CellReading['exit_reasons'] = [
    ...(okShare >= 0.95 ? [] : ['inconclusive (rows)' as const]),
    ...(share(familyBad, uncached.length) > 0.01 ? ['inconclusive (family)' as const] : []),
  ];
  return {
    mode: first.mode, arm: first.arm, site: first.site, endpoint: first.mode === 'M1' ? 'T_ask' : 'T_decision',
    planned, present: all.length, cache_excluded: all.length - uncached.length, family_excluded: familyBad, refused,
    no_answer: noAnswer, no_answer_share: share(noAnswer, rows.length), marks,
    ...pct(rows), p95_ci: p95Intervals(rows), over_budget: overBudget(rows),
    r1_budget_failure_share: share(rows.filter((r) => r.failed).length, rows.length),
    t_wire: plain(rows.flatMap((r) => r.wires)),
    t_ask_plan: first.mode === 'M2' ? plain(rows.flatMap((r) => (r.askPlan === null ? [] : [r.askPlan]))) : null,
    t_part: first.mode === 'M2' ? plain(rows.flatMap((r) => r.parts.flatMap((p) => (p.ms === null || p.ms === 0 ? [] : [p.ms])))) : null,
    by_repeat: { r1: pct(rows.filter((r) => r.repeat === 'r1')), r2_r3: pct(rows.filter((r) => r.repeat !== 'r1')) },
    by_cached_tokens: { yes: pct(rows.filter((r) => r.cachedTokens)), no: pct(rows.filter((r) => !r.cachedTokens)) },
    sensitivity: {
      without_flagged: pct(rows.filter((r) => !flagged.includes(r))), flagged: flagged.length,
      loadavg_p50: loads.length ? nearestRank(loads, 0.5) : null, loadavg_max: loads.length ? Math.max(...loads) : null,
    },
    exit: reasons[0] ?? 'ok',
    exit_reasons: reasons,
    answered_or_timed_out_share: okShare,
  };
}

/** `T_decision` p50 against the row index within each repeat, in tenths of the repeat (4.3: does the log read creep?). */
function byRowIndex(rows: readonly TimingRow[]): Record<string, { from: number; to: number; n: number; p50: number | string | null }[]> {
  const out: Record<string, { from: number; to: number; n: number; p50: number | string | null }[]> = {};
  for (const repeat of [...new Set(rows.map((r) => r.repeat))].sort()) {
    const of = rows.filter((r) => r.repeat === repeat && r.rowIndex >= 0);
    const max = Math.max(0, ...of.map((r) => r.rowIndex));
    const width = Math.max(1, Math.ceil((max + 1) / 10));
    out[repeat] = Array.from({ length: Math.ceil((max + 1) / width) }, (_, i) => {
      const bin = of.filter((r) => Math.floor(r.rowIndex / width) === i);
      return { from: i * width, to: (i + 1) * width - 1, n: bin.length, p50: shown(nearestRank(bin.map(ranked), 0.5)) };
    });
  }
  return out;
}

export interface Comparison {
  mode: 'M1' | 'M2'; site: string; percentile: 'p50' | 'p95'; a: string; b: string; items: number;
  diff: number | string; ci: { lower: number | string; upper: number | string }; p: number; p_holm: number;
  statement: string;
}

/**
 * "A is faster than B" (4.4): the paired item-level group bootstrap (2,000 resamples of groups, seed above) of the
 * difference of the percentile, A minus B, over the items both cells hold (cache hits excluded). Stated only when
 * the 95% CI lies wholly below 0 and the Holm-adjusted p (within the table: one mode, one percentile) is below 0.05.
 * p is the two-sided bootstrap p: twice the smaller count of resampled differences on either side of 0, plus one,
 * over resamples plus one.
 */
function compare(mode: 'M1' | 'M2', site: string, q: 'p50' | 'p95', a: readonly TimingRow[], b: readonly TimingRow[]): Omit<Comparison, 'p_holm' | 'statement'> {
  const items = new Set(a.map((r) => r.item).filter((item) => b.some((r) => r.item === item)));
  const level = q === 'p50' ? 0.5 : 0.95;
  const groups = byGroup([...a, ...b].filter((r) => items.has(r.item)));
  const armA = a[0]!.arm;
  const diffOf = (rows: readonly TimingRow[]) => {
    const left = rows.filter((r) => r.arm === armA).map(ranked);
    const right = rows.filter((r) => r.arm !== armA).map(ranked);
    return capped(nearestRank(left, level)) - capped(nearestRank(right, level));
  };
  const values = bootstrapValues(groups, (sample) => diffOf(sample.flat()));
  const { lower, upper } = interval(values);
  const below = values.filter((d) => d <= 0).length;
  const above = values.filter((d) => d >= 0).length;
  // (count + 1) / (B + 1): a bootstrap p is never 0.
  const p = Math.min(1, (2 * (Math.min(below, above) + 1)) / (values.length + 1));
  const signed = (x: number) => (Math.abs(x) >= SENTINEL / 2 ? (x > 0 ? '+inf (no answer)' : '-inf (no answer)') : Math.round(x));
  return { mode, site, percentile: q, a: armA, b: b[0]!.arm, items: items.size, diff: signed(diffOf(groups.flat())), ci: { lower: signed(lower), upper: signed(upper) }, p };
}

function comparisons(cells: Map<string, TimingRow[]>): Comparison[] {
  const out: Comparison[] = [];
  for (const mode of ['M1', 'M2'] as const) {
    for (const q of ['p50', 'p95'] as const) {
      const table: Omit<Comparison, 'p_holm' | 'statement'>[] = [];
      const ofMode = [...cells.values()].filter((rows) => rows[0]!.mode === mode);
      for (const site of [...new Set(ofMode.map((rows) => rows[0]!.site))].sort()) {
        const here = ofMode.filter((rows) => rows[0]!.site === site).sort((x, y) => (x[0]!.arm < y[0]!.arm ? -1 : 1));
        for (let i = 0; i < here.length; i += 1) {
          for (let j = i + 1; j < here.length; j += 1) table.push(compare(mode, site, q, here[i]!, here[j]!));
        }
      }
      const adjusted = holm(table.map((c) => c.p));
      table.forEach((c, i) => {
        const pHolm = adjusted[i]!;
        const lower = typeof c.ci.lower === 'number' ? c.ci.lower : (String(c.ci.lower).startsWith('-') ? -Infinity : Infinity);
        const upper = typeof c.ci.upper === 'number' ? c.ci.upper : (String(c.ci.upper).startsWith('-') ? -Infinity : Infinity);
        const statement = pHolm < 0.05 && upper < 0 ? `${c.a} is faster than ${c.b}`
          : pHolm < 0.05 && lower > 0 ? `${c.b} is faster than ${c.a}` : 'no difference shown';
        out.push({ ...c, p_holm: pHolm, statement });
      });
    }
  }
  return out;
}

export interface ExitCheck {
  pass: boolean;
  missing_rows: number;
  missing_cells: string[];
  inconclusive_cells: string[];
  slow_gateway: boolean;
  guard_stops: unknown[];
}

export interface TimingReadings {
  sample_sha_note: string;
  cells: CellReading[];
  comparisons: Comparison[];
  m2_t_decision_by_row_index: ReturnType<typeof byRowIndex>;
  exit_check: ExitCheck;
}

/**
 * Reads every P6 ledger under `out` against the planned cells: every M1 arm in `m1Arms` on every sample site and,
 * when `modes` holds M2, every production route whose site the sample holds; each 3 repeats x the site's sample
 * size. The plan comes from the arms file and the modes, never from the rows present, so a missing lane shows.
 */
export function readings(opts: { out: string; sample: string; cacheHit: string | null; m1Arms: readonly string[]; modes: readonly ('M1' | 'M2')[]; repeats?: number }): TimingReadings {
  const sample = JSON.parse(readFileSync(opts.sample, 'utf8')) as TimingSample;
  const repeats = opts.repeats ?? 3;
  const rows = loadRows(opts.out, parseCacheHit(opts.cacheHit));
  const cells = new Map<string, TimingRow[]>();
  for (const row of rows) {
    const key = `${row.mode}/${row.arm}/${row.site}`;
    cells.set(key, [...(cells.get(key) ?? []), row]);
  }
  const plannedOf = (site: string) => repeats * (sample.sites[site]?.k ?? 0);
  const readingsOut = [...cells.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, list]) => cellReading(list, plannedOf(list[0]!.site)));
  const expected = new Set<string>();
  if (opts.modes.includes('M1')) {
    for (const site of Object.keys(sample.sites)) {
      for (const arm of opts.m1Arms) expected.add(`M1/${arm}/${site}`);
    }
  }
  if (opts.modes.includes('M2')) {
    for (const route of M2_ROUTES) if (sample.sites[route.site]) expected.add(`M2/${m2Arm(route.combo)}/${route.site}`);
  }
  const missingCells = [...expected].filter((key) => !cells.has(key));
  const missingRows = readingsOut.reduce((sum, cell) => sum + Math.max(0, cell.planned - cell.present), 0)
    + missingCells.reduce((sum, key) => sum + plannedOf(key.split('/')[2]!), 0);
  const phase = jsonLines<{ event: string; slow_gateway?: boolean }>(join(opts.out, PHASE, 'phase.jsonl'));
  const lastEnd = phase.filter((event) => event.event === 'end_rtt').at(-1);
  const stops = jsonLines<{ action: string }>(join(opts.out, PHASE, 'guards.jsonl')).filter((line) => /stop/i.test(line.action));
  const stopFile = existsSync(join(opts.out, 'STOP')) ? [{ action: 'STOP file present' }] : [];
  const inconclusive = readingsOut.filter((cell) => cell.exit !== 'ok').map((cell) => `${cell.mode}/${cell.arm}/${cell.site}: ${cell.exit_reasons.join(', ')}`);
  const exit: ExitCheck = {
    pass: missingRows === 0 && inconclusive.length === 0 && stops.length + stopFile.length === 0,
    missing_rows: missingRows, missing_cells: missingCells, inconclusive_cells: inconclusive,
    slow_gateway: lastEnd?.slow_gateway === true, guard_stops: [...stops, ...stopFile],
  };
  return {
    sample_sha_note: 'cells are read against the sample file given; pass the frozen one',
    cells: readingsOut,
    comparisons: comparisons(new Map([...cells].flatMap(([key, list]): [string, TimingRow[]][] => {
      const kept = measured(list);
      return kept.length > 0 ? [[key, kept]] : [];
    }))),
    m2_t_decision_by_row_index: byRowIndex(measured(rows.filter((r) => r.mode === 'M2'))),
    exit_check: exit,
  };
}
