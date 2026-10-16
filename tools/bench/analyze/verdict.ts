import { DOCTOR_PING_ITEM } from '../lib/ablate';
import { E95, E99, bootstrapDraws, clopperPearson, drawAt, foldOf, holm } from '../lib/stats';
import {
  CANDIDATE, R2_TARGETS, canonSet, r2Coverage, RISK_CLASSES, SENSITIVITY_FLAGS, SITES, actAt, cellUnits, classOf, coverageOf, dangerRule, familyBlocked,
  fmtMs, mcnemarPairs, missWrite, pairUnits, pairedDiff, pairedPercentile, precisionRule, r2Cell, readAt, summarize,
  timingCell, wrongRateOf,
} from './readings';
import type { Bound, CellUnits, Danger, Gates, Meta, Plan, R2Cell, Site, TimingRow, Unit } from './readings';

/*
  Section 5's rules over the readings: 5.5 default arm per site and the production combos (Q1, Q2), 5.6 rows, rule M
  and the owner actions (Q3-Q5, Q17, D1-D5), 5.7 (Q6-Q14), and the 4.4 timing tables. Every rule names its cell;
  a rule whose input is missing, below its floor or inconclusive by design prints `inconclusive (<reason>)` and the
  missing input is also listed in `missing`, which analyze/checks.ts turns into a non-zero exit (T15).
*/

export type Cell = string | number | null;

/** One table of tables.md / summary.json, anchored for the report (9.1). */
export interface Table { anchor: string; section: number; title: string; columns: string[]; rows: Cell[][]; notes: string[] }

export interface Report { tables: Table[]; missing: string[]; verdictCells: { anchor: string; cell: string; actedGroups: number | null }[] }

/** Everything the rules read. */
export interface Inputs {
  plan: Plan; meta: Meta; resamples: number;
  /** P4 unit rows (one per item and arm) of every single arm, shipped variant. */
  units: Unit[];
  /** Every P4 shipped row as a unit (all orders and repeats), for Q9 and Q12. */
  allUnits: Unit[];
  /** P4 `recheck` and P4a (`slice: interim`) unit rows, for T29. */
  recheck: Unit[]; interimUnits: Unit[];
  /** P5 rows as units with their variant and repeat (ablation, drift, descriptor re-ask). */
  p5: (Unit & { variant: string; repeat: string; order: string; raw: Record<string, unknown> })[];
  combos: Unit[]; comboDropped: number; gates: Gates | null;
  /** Combo unit rows without a single-arm unit row of the same item (their item facts defaulted; listed as missing). */
  comboNoFacts?: number;
  timing: TimingRow[]; timingDefects: number;
}

/** The held-out verdict pool per site (5.5, 3.6). */
export const VERDICT_POOL: Readonly<Record<Site, string[]>> = {
  locate: ['N1'], find: ['F1F', 'N2'], dismiss: ['N3'], 'page-state': ['N4'], outcome: ['N5'], presence: ['N6'], 'option-map': ['N8'],
};

/** How every other set is labelled beside the verdict cell (3.3). */
export const SET_LABEL: Readonly<Record<string, string>> = {
  F1: 'in-sample', V: 'in-sample', S1: 'in-sample', S2: 'in-sample', S3: 'in-sample', S4: 'in-sample', F3: 'in-sample, stored',
  F4: 'in-sample, stored', F2: 'secondary, stored', P1: 'not fitted', P2: 'not fitted', P3: 'not fitted', P4: 'not fitted',
  P4R: 'not fitted', N7: 'ablation', N9: 'injection', N10: 'PII', N11: 'descriptor re-ask',
};

export function pStarOf(site: string): number {
  return site === 'option-map' ? 0.95 : 0.99;
}

export function floorOf(site: string): number {
  return site === 'option-map' ? E95 : E99;
}

/** The least n_eff at which 0 wrong passes at P (one-sided 95% CP): 299 at 0.99, 149 at 0.98, 59 at 0.95 (3.1). */
export function floorAt(P: number): number {
  return P >= 0.99 ? E99 : P >= 0.98 ? 149 : E95;
}

/** The printed danger bound: deff-adjusted, or the exact CP upper when the cell is below D299 (3.1, 5.5). */
export function dangerText(d: Danger): string {
  const bound = d.verdict === 'below D299' ? `exact ${r4(d.exactUpper)}` : r4(d.upper);
  return `${bound} (${d.verdict})${d.perWait === null ? '' : `; per wait ${r4(d.perWait)}`}`;
}

/** Sites whose verdict carries the danger condition (5.5 step 1). */
export const DANGER_SITES: ReadonlySet<string> = new Set(['dismiss', 'page-state', 'outcome', 'presence']);

/** 5.5 candidates: only the routes refsure can take today; `timing` = the P6 M2 ledger arm of that route. */
export interface Candidate { id: string; incumbent: boolean; combo: boolean; timing: string }

export function candidatesOf(site: Site): Candidate[] {
  const jev = (incumbent: boolean): Candidate => ({ id: 'jev_gw', incumbent, combo: false, timing: 'm2_jev' });
  if (site === 'dismiss') return [jev(false), { id: 'agree', incumbent: true, combo: true, timing: 'm2_agree' }];
  if (site === 'page-state') {
    return [jev(false), { id: 'oa_primary', incumbent: false, combo: false, timing: 'm2_openai' }, { id: 'fallback', incumbent: true, combo: true, timing: 'm2_fallback' }];
  }
  if (site === 'presence') {
    return [jev(false), { id: 'oa_s2', incumbent: false, combo: false, timing: 'm2_openai' }, { id: 'agree', incumbent: true, combo: true, timing: 'm2_agree' }];
  }
  return [jev(true)];
}

/** Rounds for print: rates to 4 places, everything else as given. */
export function r4(v: number | null | undefined): Cell {
  if (v === Number.POSITIVE_INFINITY) return 'inf';
  if (v === Number.NEGATIVE_INFINITY) return '-inf';
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10_000) / 10_000;
}

/** A Clopper-Pearson-backed rule's printed verdict with its floor reason. */
export function ruleText(b: Bound): string {
  if (b.verdict === 'inconclusive (n)') return `inconclusive (n: n_eff ${b.nEff} of ${b.floor}, ${b.n} acted, ${b.groups} groups)`;
  return b.verdict;
}

/** The rules' shared reads: cells, rho pools, failure shares, timing rows; every missing input is recorded. */
export class Ctx {
  readonly missing = new Set<string>();
  constructor(readonly i: Inputs) {}

  miss(what: string): string {
    this.missing.add(what);
    return `inconclusive (missing ${what})`;
  }

  /** One cell of an arm or combo at a site over sets (X3: pixel rows only when asked). */
  cell(arm: string, site: string, sets: readonly string[], pixel = false): CellUnits {
    const source = this.i.units.some((u) => u.arm === arm) ? this.i.units : this.i.combos;
    return cellUnits(source, { arm, site, sets, pixel });
  }

  /** Every arm and set of a site (the 3.1 rho pool), text rows only. */
  pool(site: string): Unit[] {
    return [...this.i.units, ...this.i.combos].filter((u) => u.site === site && !u.visualOnly && !u.familyBad);
  }

  timingOf(arm: string, site: string): TimingRow[] {
    return this.i.timing.filter((r) => r.arm === arm && r.site === site);
  }

  /** 4.4 R1-budget failure share: M2's for a production route (`m2_*`), M1's for an arm; null when P6 lacks it. */
  failShare(timingArm: string, site: string): number | null {
    const rows = this.timingOf(timingArm, site).filter((r) => !r.cacheHit);
    return rows.length === 0 ? null : rows.filter((r) => r.failure).length / rows.length;
  }

  /** A research combo's share from its parts' M1 shares (5.2): agree 1 - (1 - a)(1 - b), fallback a x b. */
  comboShare(combo: string, site: string): number | null {
    const parts = [...new Set(this.i.combos.filter((u) => u.arm === combo).flatMap((u) => u.partArms ?? []))];
    const shares = parts.map((arm) => this.failShare(arm, site));
    if (shares.length < 2 || shares.some((s) => s === null)) return null;
    const [a, b] = shares as number[];
    return /agree/.test(combo) ? 1 - (1 - a!) * (1 - b!) : a! * b!;
  }
}

/**
 * $ per 1,000 Decisions (Q14): 1,000 x mean attempt-1 dollars over the unit rows. An answered row without a
 * priceable usage makes the figure n/a (never a silent zero); the unpriced count is printed beside it.
 */
export function usdPer1000(units: readonly Unit[]): { usd: number; unpriced: number } {
  const priced = units.filter((u) => u.usd1 !== null);
  const unpriced = units.length - priced.length;
  const usd = priced.length === 0 || unpriced > 0 ? Number.NaN : (1000 * priced.reduce((a, u) => a + u.usd1!, 0)) / priced.length;
  return { usd, unpriced };
}

/** One candidate read by 5.5 step 1 on the verdict cell. */
export interface CandEval {
  cand: Candidate; units: Unit[]; cell: CellUnits; status: string; prec: Bound | null; danger: Danger | null;
  coverage: number; share: number | null; budgetCoverage: number | null; usd: number; alpha: number;
}

/** Why a cell cannot be read at all, before any rule: no rows, `family_ok`, or dismiss rows without settle inputs. */
export function blockOf(ctx: Ctx, id: string, site: string, cell: CellUnits, sets: readonly string[]): string | null {
  if (cell.units.length === 0) return ctx.miss(`P4 rows of ${id} at ${site} on ${sets.join('+')}`);
  if (familyBlocked(cell)) return `inconclusive (family: ${cell.family} of ${cell.total} rows)`;
  if (site === 'dismiss') {
    const open = cell.units.filter((u) => u.actedBefore && u.vetoed === null).length;
    if (open > 0) return `inconclusive (no settle inputs: ${open} acted rows)`;
  }
  return null;
}

/** 5.5 step 1 for one unit list: safe, fail or inconclusive (reason), at P* and `alpha`. */
export function safety(ctx: Ctx, site: string, units: readonly Unit[], alpha: number, pStar = pStarOf(site), resamples = ctx.i.resamples): { status: string; prec: Bound; danger: Danger | null } {
  const pool = ctx.pool(site);
  const prec = precisionRule(units, pStar, floorOf(site), { alpha, pool, resamples });
  const danger = DANGER_SITES.has(site) ? dangerRule(units, pool) : null;
  let status: string;
  if (prec.verdict === 'fail' || danger?.verdict === 'unsafe') status = 'fail';
  else if (prec.verdict === 'pass' && (danger === null || danger.verdict === 'safe')) status = 'safe';
  else status = prec.verdict !== 'pass' ? ruleText(prec) : 'inconclusive (below D299)';
  return { status, prec, danger };
}

export function evalCandidate(ctx: Ctx, site: Site, cand: Candidate, k: number): CandEval {
  const sets = VERDICT_POOL[site];
  const cell = ctx.cell(cand.id, site, sets);
  const units = site === 'page-state' ? cell.units.filter((u) => u.origin === 'native') : cell.units;
  const alpha = cand.incumbent ? 0.05 : 0.05 / k;
  const share = ctx.failShare(cand.timing, site);
  const coverage = coverageOf(units);
  const base = { cand, units, cell, coverage, share, budgetCoverage: share === null ? null : coverage * (1 - share), usd: usdPer1000(units).usd, alpha };
  const block = blockOf(ctx, cand.id, site, cell, sets);
  if (block !== null) return { ...base, status: block, prec: null, danger: null };
  const s = safety(ctx, site, units, alpha);
  return { ...base, ...s };
}

/** Mean attempt-1 dollars of the priced units (the paired cost statistic of 5.5 step 2). */
function meanUsd(units: readonly Unit[]): number {
  const priced = units.filter((u) => u.usd1 !== null);
  return priced.length === 0 ? Number.NaN : priced.reduce((a, u) => a + u.usd1!, 0) / priced.length;
}

/**
 * 5.5 step 2 among `safe`: A* = the highest coverage under `cov`; candidates whose paired coverage difference CI
 * lies above -0.03 are tied; the pick starts as the incumbent when tied; a tied X replaces it on p95 `T_decision`
 * (CI wholly below 0 and >= 10% of the pick's p95) or, when neither is shown faster, on $ per 1,000 Decisions.
 */
export function pickDefault(ctx: Ctx, site: Site, safe: readonly CandEval[], cov: (e: CandEval) => (units: readonly Unit[]) => number):
  { id: string; tied: string[]; notes: string[] } {
  const notes: string[] = [];
  const score = (e: CandEval) => cov(e)(e.units);
  const best = [...safe].sort((a, b) => score(b) - score(a))[0]!;
  const tied = safe.filter((x) => x === best || pairedDiff(pairUnits(best.units, x.units), cov(best), ctx.i.resamples, cov(x)).lower > -0.03);
  let pick = tied.find((e) => e.cand.incumbent) ?? best;
  const qualified: { e: CandEval; p95: number }[] = [];
  for (const x of tied.filter((e) => e !== pick)) {
    const tx = ctx.timingOf(x.cand.timing, site);
    const tp = ctx.timingOf(pick.cand.timing, site);
    if (tx.length === 0 || tp.length === 0) {
      notes.push(ctx.miss(`P6 M2 rows of ${tx.length === 0 ? x.cand.timing : pick.cand.timing} at ${site}`));
      continue;
    }
    const d = pairedPercentile(tx, tp, 0.95, ctx.i.resamples);
    const pickP95 = timingCell(tp, { resamples: ctx.i.resamples }).p95;
    const p95 = timingCell(tx, { resamples: ctx.i.resamples }).p95;
    if (d.upper < 0 && d.estimate <= -0.1 * pickP95) { qualified.push({ e: x, p95 }); continue; }
    if (d.upper < 0 || d.lower > 0) continue;
    const c = pairedDiff(pairUnits(pick.units, x.units), meanUsd, ctx.i.resamples);
    if (c.upper < 0 && c.estimate <= -0.1 * meanUsd(pick.units)) qualified.push({ e: x, p95 });
  }
  if (qualified.length > 0) {
    const winner = qualified.sort((a, b) => a.p95 - b.p95)[0]!.e;
    notes.push(`${winner.cand.id} replaces ${pick.cand.id} on time or cost`);
    pick = winner;
  }
  return { id: pick.cand.id, tied: tied.map((e) => e.cand.id), notes };
}

/** 5.5 step 3 wording. */
export function verdictText(def: string, evals: readonly CandEval[]): string {
  const incumbent = evals.find((e) => e.cand.incumbent)!;
  if (def === incumbent.cand.id) return `keep ${def}`;
  if (incumbent.status === 'safe') return `switch to ${def}`;
  if (incumbent.status === 'fail') return `switch to ${def} (incumbent unsafe)`;
  return `switch to ${def} (incumbent not shown safe)`;
}

export interface SiteVerdict { site: Site; evals: CandEval[]; text: string; def: string | null; notes: string[]; fragile: string[] }

/** 5.5 steps 1-4 for one site, with the T6, T3 and flagged-row sensitivity readings (5.7). */
export function siteVerdict(ctx: Ctx, site: Site): SiteVerdict {
  const cands = candidatesOf(site);
  const evals = cands.map((c) => evalCandidate(ctx, site, c, cands.length));
  const pS = pStarOf(site);
  const safe = evals.filter((e) => e.status === 'safe');
  const notes: string[] = [];
  let text: string;
  let def: string | null = null;
  if (safe.length === 0) {
    text = evals.every((e) => e.status === 'fail') ? `every route fails ${pS}` : `no route shown safe at ${pS}`;
  } else if (safe.some((e) => e.share === null)) {
    text = ctx.miss(`P6 M2 failure share at ${site} for ${safe.filter((e) => e.share === null).map((e) => e.cand.timing).join(', ')}`);
  } else {
    const budget = (e: CandEval) => (units: readonly Unit[]) => coverageOf(units) * (1 - e.share!);
    const picked = pickDefault(ctx, site, safe, budget);
    def = picked.id;
    notes.push(...picked.notes, `tied: ${picked.tied.join(', ')}`);
    text = verdictText(def, evals);
    const r2cov = () => (units: readonly Unit[]) => r2Coverage(units, pS, site);
    const r2def = safe.length > 1 ? pickDefault(ctx, site, safe, r2cov).id : def;
    if (r2def !== def) text += ` row-dependent (R2 names ${r2def})`;
  }
  const fragile = evals.flatMap((e) => sensitivity(ctx, site, e));
  return { site, evals, text: fragile.length > 0 ? `${text} fragile` : text, def, notes, fragile };
}

/** The group of the most influential wrong act (most wrong acts, then most acted, then key); else the largest acted group. */
export function influentialGroup(units: readonly Unit[]): string | null {
  const stats = new Map<string, { wrong: number; acted: number }>();
  for (const u of units.filter((x) => x.acted)) {
    const s = stats.get(u.group) ?? { wrong: 0, acted: 0 };
    s.acted += 1;
    if (!u.correct) s.wrong += 1;
    stats.set(u.group, s);
  }
  const ranked = [...stats.entries()].sort((a, b) => b[1].wrong - a[1].wrong || b[1].acted - a[1].acted || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

/**
 * T6, T3 and the flagged-row reading (5.7) for one candidate's step-1 status. T6 removes the most influential
 * group; `fragile` only when the status changes beyond what removing the same n from right acts does. T3 drops the
 * items whose label needed adjudication (item field `adjudicated`). Flagged: without high_load, slow_gateway,
 * slow_window, capped or peeked rows. Returns the reasons it is fragile (empty when not).
 */
export function sensitivity(ctx: Ctx, site: string, e: CandEval): string[] {
  if (e.prec === null) return [];
  // Status only: the bootstrap sensitivity bounds are not part of a status, so no resamples here.
  const status = (units: readonly Unit[]) => safety(ctx, site, units, e.alpha, pStarOf(site), 0).status;
  const out: string[] = [];
  const g = influentialGroup(e.units);
  if (g !== null) {
    const removed = e.units.filter((u) => u.group === g);
    const without = e.units.filter((u) => u.group !== g);
    const rights = e.units.filter((u) => u.acted && u.correct && u.group !== g).sort((a, b) => a.key.localeCompare(b.key)).slice(0, removed.filter((u) => u.acted).length);
    const control = e.units.filter((u) => !rights.includes(u));
    const v1 = status(without);
    if (v1 !== e.status && v1 !== status(control)) out.push(`${e.cand.id}: T6 (without ${g}: ${v1})`);
  }
  // An item whose label needed adjudication carries `adjudicated: true` in its frozen set file; an item without the
  // field was not adjudicated. Only an item with no metadata at all (its set file not in the plan) is a missing input.
  const noMeta = e.units.filter((u) => ctx.i.meta.get(u.key) === undefined).length;
  if (noMeta > 0) {
    ctx.miss(`item metadata (set files in the plan) for ${noMeta} ${e.cand.id} ${site} items (T3)`);
  } else {
    const v = status(e.units.filter((u) => ctx.i.meta.get(u.key)?.adjudicated !== true));
    if (v !== e.status) out.push(`${e.cand.id}: T3 (without adjudicated labels: ${v})`);
  }
  const flagged = [...SENSITIVITY_FLAGS, 'capped', 'peeked'];
  const clean = e.units.filter((u) => !u.flags.some((f) => flagged.includes(f)));
  if (clean.length !== e.units.length) {
    const v = status(clean);
    if (v !== e.status) out.push(`${e.cand.id}: flagged rows (without them: ${v})`);
  }
  return out;
}

const SITE_COLUMNS = ['arm', 'cell', 'label', 'items', 'failed rows', 'acted', 'acted groups', 'R1-answer cov', 'R1-budget cov', 'act rate',
  'precision', 'deff lower', 'item-CP lower / cluster-boot lower', 'rule at P*', 'at 0.98', 'at 0.95', 'wrong', 'dangerous / eligible', 'danger upper', 'before settle',
  'miss_write', 'R2 cov .95', 'R2 cov .98', 'R2 cov .99', 'R2 row .99', 'p50', 'p95', 'p95 CI', 'over budget', '$ / 1,000', '$ / settled'];

/** The arms and combos with rows at a site, candidates first. */
function armsAt(ctx: Ctx, site: Site): string[] {
  const all = [...new Set([...ctx.i.units, ...ctx.i.combos].filter((u) => u.site === site).map((u) => u.arm))].sort();
  const cands = candidatesOf(site).map((c) => c.id);
  return [...cands.filter((id) => all.includes(id)), ...all.filter((id) => !cands.includes(id))];
}

/** The timing cell 9.1 prints beside an arm: M2 for a production route, M1 for a single arm, none for a bench combo. */
function timingFor(ctx: Ctx, site: Site, arm: string): TimingRow[] {
  const cand = candidatesOf(site).find((c) => c.id === arm);
  return ctx.timingOf(cand ? cand.timing : arm, site);
}

/** One printed row of a site table (9.1 item 2). `r2` only on the verdict pool. */
export function siteRow(ctx: Ctx, site: Site, arm: string, sets: readonly string[], label: string, opts: { r2: boolean; at?: number; status?: string }): Cell[] {
  const cell = ctx.cell(arm, site, sets);
  const units = (site === 'page-state' && label === 'verdict cell' ? cell.units.filter((u) => u.origin === 'native') : cell.units).map((u) => readAt(u, opts.at));
  const name = opts.at === undefined ? arm : `${arm} @${opts.at}`;
  if (units.length === 0) return [name, sets.join('+'), label, 0, ...SITE_COLUMNS.slice(4).map(() => null)];
  const pool = ctx.pool(site);
  const s = summarize(units);
  const pS = pStarOf(site);
  const rule = (p: number, resamples = 0) => precisionRule(units, p, p === pS ? floorOf(site) : floorAt(p), { pool, resamples });
  const main = rule(pS, ctx.i.resamples);
  const danger = dangerRule(units, pool);
  const cand = candidatesOf(site).find((c) => c.id === arm);
  const share = cand ? ctx.failShare(cand.timing, site) : arm.startsWith('bench:') ? ctx.comboShare(arm, site) : ctx.failShare(arm, site);
  const timing = timingFor(ctx, site, arm);
  const t = timing.length > 0 ? timingCell(timing, { fallback: arm === 'fallback', resamples: ctx.i.resamples }) : null;
  const r2 = opts.r2 ? R2_TARGETS.map((P) => r2Cell(units, P, site, { pool, floor: floorOf(site), resamples: ctx.i.resamples })) : [];
  const usd = usdPer1000(units).usd;
  // Dismiss before settle (Terms): a vetoed pick counts as acted; a dismiss wrong act is its dangerous act.
  const before = site === 'dismiss' ? `${units.filter((u) => u.dangerousBefore).length} wrong of ${units.filter((u) => u.actedBefore).length} acted` : null;
  const mw = site === 'outcome' ? missWrite(units) : null;
  const r2row = r2[2] ? Object.entries(r2[2].rows).map(([k, v]) => `${k === 'all' ? '' : `${k} `}${v === null ? 'none' : r4(v)}`).join('; ') + (arm === 'agree' || arm === 'fallback' || arm.startsWith('bench:') ? ' (shared)' : '') : null;
  return [
    name, sets.join('+'), familyBlocked(cell) ? `${label}; inconclusive (family)` : label, s.items, s.failures, s.acted, s.actedGroups,
    r4(s.coverage), share === null ? 'missing P6' : r4(s.coverage * (1 - share)), r4(s.actRate), r4(s.precision), r4(main.lower),
    `${r4(main.itemLower)} / ${r4(main.bootLower)}`,
    opts.status ?? ruleText(main), ruleText(rule(0.98)), ruleText(rule(0.95)), s.wrong, `${s.dangerous} / ${s.dangerEligible}`,
    dangerText(danger), before,
    mw ? `${mw.x}/${mw.n} [${r4(mw.lower)}, ${r4(mw.upper)}]` : null,
    ...[0, 1, 2].map((i) => (r2[i] ? `${r4(r2[i]!.coverage)}${r2[i]!.missed ? ' R2 missed P' : ''}` : null)), r2row,
    t ? fmtMs(t.p50) : null, t ? fmtMs(t.p95) : null, t ? `[${fmtMs(t.p95Ci.lower)}, ${fmtMs(t.p95Ci.upper)}]` : null,
    t ? (t.overDecision10k === null ? r4(t.overBudget) : `part ${r4(t.overPart)}; Decision@10k ${r4(t.overDecision10k)}`) : null,
    r4(usd), r4(usd / 1000 / s.coverage),
  ];
}

/** 9.1 item 2: one table per site, the verdict pool first (every arm and combo), then every other set labelled. */
export function siteTable(ctx: Ctx, sv: SiteVerdict): Table {
  const site = sv.site;
  const pool = VERDICT_POOL[site];
  const rows: Cell[][] = [];
  for (const arm of armsAt(ctx, site)) {
    const e = sv.evals.find((x) => x.cand.id === arm);
    rows.push(siteRow(ctx, site, arm, pool, e ? `verdict cell${e.cand.incumbent ? ', incumbent' : ''}` : 'verdict cell, printed beside', { r2: true, ...(e ? { status: e.status } : {}) }));
    if (site === 'option-map') rows.push(siteRow(ctx, site, arm, pool, 'experimental write gate', { r2: false, at: 0.85 }));
  }
  const others = [...new Set(ctx.i.units.filter((u) => u.site === site && !pool.includes(u.set)).map((u) => u.set))].sort();
  for (const set of others) for (const arm of armsAt(ctx, site)) {
    if (ctx.cell(arm, site, [set]).total > 0) rows.push(siteRow(ctx, site, arm, [set], SET_LABEL[set] ?? 'side set', { r2: false }));
  }
  const notes = [`verdict: ${sv.text}`, ...sv.notes, ...sv.fragile.map((f) => `fragile: ${f}`),
    `P* = ${pStarOf(site)}; threshold_source per row as stored; R1-budget = coverage x (1 - conc-1 failure share, 4.4)`];
  return { anchor: `site-${site}`, section: 2, title: `${site}: arms, combos and the default-arm verdict (Q1, Q3-Q5, Q13, Q14)`, columns: SITE_COLUMNS, rows, notes };
}

/** The live-check state every combo reading carries (2.4): null when the readings may stand, else why not. */
export function gateBlock(ctx: Ctx, site: string): { block: string | null; note: string | null } {
  const g = ctx.i.gates;
  if (g === null) return { block: ctx.miss('P5b live-check gates (gates.json)'), note: null };
  if (!g.replay.ok) return { block: `inconclusive (replay gate failed: ${g.replay.mismatches} mismatches)`, note: null };
  const sep = g.separate[site];
  if (!sep) return { block: ctx.miss(`P5b separate-rows gate at ${site}`), note: null };
  if (sep.unexplained > 0) return { block: `inconclusive (bench defect: ${sep.unexplained} unexplained separate-rows mismatches)`, note: null };
  return { block: null, note: sep.share < 0.9 ? `approximation (separate-rows agreement ${r4(sep.share)} < 0.90; the live items carry the verdict at E95 at most)` : null };
}

const COMBO_COLUMNS = ['site', 'combo', 'comparator', 'items', 'wrong-act diff [CI]', 'McNemar one-sided p (b/c)', 'coverage diff [CI]',
  'OpenAI-branch acts', 'verdict', 'added $ / 1,000', 'added p50', 'added p95'];

/** Q2 (5.5 combos): each production combo against Jev alone (and presence `agree` against `oa_s2`); research combos beside. */
export function comboTable(ctx: Ctx, verdicts: ReadonlyMap<Site, SiteVerdict>): Table {
  const rows: Cell[][] = [];
  const notes: string[] = [];
  const specs: { site: Site; combo: string; vs: string; vsTiming: string }[] = [
    { site: 'dismiss', combo: 'agree', vs: 'jev_gw', vsTiming: 'm2_jev' }, { site: 'presence', combo: 'agree', vs: 'jev_gw', vsTiming: 'm2_jev' },
    { site: 'presence', combo: 'agree', vs: 'oa_s2', vsTiming: 'm2_openai' }, { site: 'page-state', combo: 'fallback', vs: 'jev_gw', vsTiming: 'm2_jev' },
  ];
  for (const spec of specs) {
    const pool = VERDICT_POOL[spec.site];
    const native = (units: Unit[]) => (spec.site === 'page-state' ? units.filter((u) => u.origin === 'native') : units);
    const combo = native(ctx.cell(spec.combo, spec.site, pool).units);
    const base = native(ctx.cell(spec.vs, spec.site, pool).units);
    const pairs = pairUnits(base, combo);
    const head: Cell[] = [spec.site, spec.combo, spec.vs, pairs.length];
    const gate = gateBlock(ctx, spec.site);
    if (pairs.length === 0) { rows.push([...head, null, null, null, null, ctx.miss(`paired rows of ${spec.combo} and ${spec.vs} at ${spec.site}`), null, null, null]); continue; }
    const wd = pairedDiff(pairs, wrongRateOf, ctx.i.resamples);
    const mc = mcnemarPairs(pairs, (u) => u.acted && !u.correct);
    const cd = pairedDiff(pairs, coverageOf, ctx.i.resamples);
    const sv = verdicts.get(spec.site);
    let branch: string | null = null;
    let verdict: string;
    if (spec.combo === 'fallback') {
      const second = combo.filter((u) => u.branch === 'second');
      const rule = precisionRule(second, pStarOf(spec.site), floorOf(spec.site), { pool: ctx.pool(spec.site), resamples: ctx.i.resamples });
      branch = `${rule.n} acted, ${rule.x} wrong: ${ruleText(rule)}`;
      const comboSafe = sv?.evals.find((e) => e.cand.id === 'fallback')?.status === 'safe';
      const jevSafe = sv?.evals.find((e) => e.cand.id === 'jev_gw')?.status === 'safe';
      verdict = cd.lower > 0.03 && comboSafe && rule.verdict === 'pass' ? 'adds coverage'
        : (!comboSafe && jevSafe) || rule.verdict === 'fail' ? 'adds risk' : 'not shown';
    } else {
      const fewer = wd.upper < 0 && mc.pBFewer < 0.05;
      verdict = fewer && cd.lower >= -0.10 ? 'earns' : fewer ? 'safer but costs coverage' : 'not shown';
    }
    if (gate.block !== null) verdict = gate.block;
    else if (gate.note !== null) verdict += ` ${gate.note}`;
    const tc = ctx.timingOf(`m2_${spec.combo}`, spec.site);
    const tb = ctx.timingOf(spec.vsTiming, spec.site);
    const c1 = tc.length > 0 ? timingCell(tc, { resamples: 0 }) : null;
    const c0 = tb.length > 0 ? timingCell(tb, { resamples: 0 }) : null;
    rows.push([...head, `${r4(wd.estimate)} [${r4(wd.lower)}, ${r4(wd.upper)}]`, `${r4(mc.pBFewer)} (${mc.b}/${mc.c})`,
      `${r4(cd.estimate)} [${r4(cd.lower)}, ${r4(cd.upper)}]`, branch, verdict,
      r4(usdPer1000(pairs.map((p) => p.b)).usd - usdPer1000(pairs.map((p) => p.a)).usd),
      c1 && c0 ? r4(c1.p50 - c0.p50) : ctx.miss(`P6 M2 rows of m2_${spec.combo} or ${spec.vsTiming} at ${spec.site}`),
      c1 && c0 ? r4(c1.p95 - c0.p95) : null]);
  }
  for (const u of [...new Set(ctx.i.combos.filter((x) => x.arm.startsWith('bench:')).map((x) => `${x.site}\0${x.arm}`))].sort()) {
    const [site, arm] = u.split('\0') as [Site, string];
    const units = ctx.cell(arm, site, VERDICT_POOL[site]).units;
    const s = summarize(units);
    rows.push([site, arm, 'bench_combinator (research, outside the verdict)', s.items, `wrong ${s.wrong}`, null, `coverage ${r4(s.coverage)}`, null,
      `precision ${r4(s.precision)}`, r4(usdPer1000(units).usd), 'offline time only', null]);
  }
  const g = ctx.i.gates;
  notes.push(g === null ? 'live check: gates.json missing' : `live check: replay ${g.replay.ok ? 'ok' : 'FAILED'}; separate rows ${Object.entries(g.separate).map(([s, v]) => `${s} ${r4(v.share)} (${v.unexplained} unexplained)`).join(', ')}`);
  notes.push('Offline combo time is an approximation; combo time in verdict tables comes only from P6 M2.');
  return { anchor: 'combos', section: 3, title: 'Combos (Q2) with the live-check result', columns: COMBO_COLUMNS, rows, notes };
}

/* ---------- 5.6: rows, rule M, owner actions ---------- */

/** Rule M (5.6) on held-out, native, text-solvable data of the verdict pool, at the shipped row or re-read at `row`. */
export interface RuleM { status: string; pass: boolean; fail: boolean; prec: Bound | null; danger: Danger | null; r2row: number | null; units: Unit[] }

export function ruleM(ctx: Ctx, site: Site, arm: string, row?: number): RuleM {
  const pool = VERDICT_POOL[site];
  const cell = ctx.cell(arm, site, pool);
  const units = cell.units.filter((u) => u.origin === 'native').map((u) => readAt(u, row));
  const block = blockOf(ctx, arm, site, { ...cell, units }, pool);
  if (block !== null) return { status: block, pass: false, fail: false, prec: null, danger: null, r2row: null, units };
  return ruleMOn(ctx, site, units);
}

/** Rule M's reading (5.6: precision at 0.99 with E99, and the danger condition on its sites) on given units. */
export function ruleMOn(ctx: Ctx, site: Site, units: Unit[]): RuleM {
  const s = safety(ctx, site, units, 0.05, 0.99, 0);
  const r2 = r2Cell(units, 0.99, site, { pool: ctx.pool(site), floor: E99, resamples: 0 });
  const r2row = r2.rows.all ?? null;
  if (s.status === 'safe') return { status: 'pass', pass: true, fail: false, prec: s.prec, danger: s.danger, r2row, units };
  if (s.status === 'fail') return { status: `row unsafe; R2 row ${r2row === null ? 'none' : r4(r2row)}`, pass: false, fail: true, prec: s.prec, danger: s.danger, r2row, units };
  return { status: s.status, pass: false, fail: false, prec: s.prec, danger: s.danger, r2row, units };
}

/** A band [lo, hi) reading (D2, D3, D5): acts at lo that do not act at hi, with the exact two-sided 95% CP of precision. */
export function band(units: readonly Unit[], lo: number, hi: number, pool?: readonly Unit[]): { n: number; wrong: number; precision: number; lower: number; upper: number; nEff: number; deffLower: number } {
  const inBand = units.filter((u) => actAt(u, lo).acted && !actAt(u, hi).acted).map((u) => ({ ...u, ...actAt(u, lo) }));
  const wrong = inBand.filter((u) => !u.correct).length;
  const cp = clopperPearson(wrong, inBand.length, 0.025);
  const deff = precisionRule(inBand, 0.95, E95, { pool, resamples: 0 });
  return { n: inBand.length, wrong, precision: inBand.length === 0 ? Number.NaN : 1 - wrong / inBand.length,
    lower: 1 - cp.upper, upper: 1 - cp.lower, nEff: deff.nEff, deffLower: deff.lower };
}

/** Q3 wording (5.6): verdict at 0.99 (E99); a 0.95 pass is `holds at 0.95 only`; below 59 n_eff, `inconclusive by design (n)`. */
export function q3Text(ctx: Ctx, site: string, units: readonly Unit[]): { text: string; p99: Bound; p95: Bound } {
  const pool = ctx.pool(site);
  const p99 = precisionRule(units, 0.99, E99, { pool, resamples: ctx.i.resamples });
  const p95 = precisionRule(units, 0.95, E95, { pool, resamples: ctx.i.resamples });
  let text: string;
  if (p99.verdict === 'pass' || p99.verdict === 'fail') text = p99.verdict;
  else if (p95.verdict === 'pass') text = 'holds at 0.95 only';
  else if (p95.nEff < E95) text = `inconclusive by design (n: n_eff ${p95.nEff})`;
  else text = `${ruleText(p99)} at 0.99; 0.95 reads ${p95.verdict}`;
  return { text, p99, p95 };
}

const Q3_COLUMNS = ['site', 'row', 'cell', 'items', 'acted', 'acted groups', 'wrong', 'precision', 'deff lower 0.99', 'deff lower 0.95', 'n_eff', 'verdict'];

/** Q3 and D3: Jev's shipped rows on held-out data (locate N1 per risk; find F1F + N2 per class; outcome N5). */
export function q3Table(ctx: Ctx): { table: Table; d3: string } {
  const rows: Cell[][] = [];
  const add = (site: Site, rowName: string, units: Unit[]) => {
    if (units.length === 0) { rows.push([site, rowName, VERDICT_POOL[site].join('+'), 0, null, null, null, null, null, null, null, 'no items in this class']); return; }
    const s = summarize(units);
    const q = q3Text(ctx, site, units);
    rows.push([site, rowName, VERDICT_POOL[site].join('+'), s.items, s.acted, s.actedGroups, s.wrong, r4(s.precision), r4(q.p99.lower), r4(q.p95.lower), q.p99.nEff, q.text]);
  };
  for (const site of ['locate', 'find', 'outcome'] as const) {
    const cell = ctx.cell('jev_gw', site, VERDICT_POOL[site]);
    const block = blockOf(ctx, 'jev_gw', site, cell, VERDICT_POOL[site]);
    if (block !== null) { rows.push([site, 'every row', VERDICT_POOL[site].join('+'), cell.units.length, null, null, null, null, null, null, null, block]); continue; }
    add(site, site === 'outcome' ? 'yes >= .93' : 'every risk', cell.units);
    if (site !== 'outcome') for (const cls of RISK_CLASSES) add(site, cls === 'none' ? 'no risk' : cls, cell.units.filter((u) => classOf(u) === cls));
  }
  const write = ctx.cell('jev_gw', 'locate', ['N1']).units.filter((u) => u.risk === 'write');
  let d3: string;
  if (write.length === 0) d3 = ctx.miss('N1 locate write rows of jev_gw (D3)');
  else {
    const at80 = write.map((u) => readAt(u, 0.8));
    const r99 = precisionRule(at80, 0.99, E99, { pool: ctx.pool('locate'), resamples: ctx.i.resamples });
    const r95 = precisionRule(at80, 0.95, E95, { pool: ctx.pool('locate'), resamples: ctx.i.resamples });
    const b = band(write, 0.8, 0.89, ctx.pool('locate'));
    add('locate', 'write at 0.80 (D3)', at80);
    add('locate', 'write at 0.89 (D3)', write);
    rows.push(['locate', 'band [0.80, 0.89) (D3)', 'N1', b.n, b.n, null, b.wrong, r4(b.precision), r4(b.lower), r4(b.upper), b.nEff, 'exact two-sided 95% interval']);
    const safe80 = r99.verdict === 'pass' ? '0.80 is safe' : r99.verdict === 'fail' ? '0.80 fails at 0.99' : 'inconclusive by design at 0.99';
    const holds = b.nEff >= E95 && b.deffLower >= 0.95 && r95.verdict === 'pass' ? '; 0.80 holds at 0.95 only' : '';
    d3 = `${safe80}${holds} (band [0.80, 0.89): ${b.n} acts, ${b.wrong} wrong, precision ${r4(b.precision)} [${r4(b.lower)}, ${r4(b.upper)}])`;
  }
  return { table: { anchor: 'q3', section: 2, title: "Jev's shipped rows on held-out data (Q3, D3)", columns: Q3_COLUMNS, rows, notes: [`D3: ${d3}`] }, d3 };
}

/** D1 text-only scope (5.6): dangerous acts per candidate route on the pixel-only slice, with the exact upper bound. */
export function pixelScope(ctx: Ctx, site: Site): { text: string; rows: Cell[][]; harm: boolean | null } {
  const sets = [...new Set([...ctx.i.units, ...ctx.i.combos].filter((u) => u.site === site && u.visualOnly).map((u) => u.set))].sort();
  const rows: Cell[][] = [];
  let harm = false;
  let n = 0;
  let worst = 0;
  for (const cand of candidatesOf(site)) {
    const units = ctx.cell(cand.id, site, sets, true).units.filter((u) => u.dangerEligible);
    const x = units.filter((u) => u.dangerous).length;
    const upper = clopperPearson(x, units.length).upper;
    if (x > 0) harm = true;
    n = Math.max(n, units.length);
    worst = Math.max(worst, upper);
    rows.push([site, cand.id, sets.join('+'), units.length, x, r4(upper)]);
  }
  if (n === 0) return { text: ctx.miss(`pixel-only ${site} rows`), rows, harm: null };
  const text = harm ? 'pixel-only pages need the text-only scope (refuse or declare out of scope)'
    : `no harm shown on ${n} pixel pages (upper bound ${r4(worst)})`;
  return { text, rows, harm };
}

/** An owner action from rule M at the shipped row and at the held fit (D1 has no second row). */
function ownerAction(ctx: Ctx, site: Site, shipped: number, held: number | null, name: (t: number) => string): { text: string; m: RuleM; mHeld: RuleM | null } {
  const m = ruleM(ctx, site, 'jev_gw');
  const mHeld = held === null ? null : ruleM(ctx, site, 'jev_gw', held);
  if (m.pass) return { text: `keep ${name(shipped)}`, m, mHeld };
  if (mHeld === null) return { text: m.status, m, mHeld };
  if (mHeld.pass && m.fail) return { text: `raise to ${name(held!)}`, m, mHeld };
  if (mHeld.pass) return { text: `raise to ${name(held!)} (${name(shipped)} not shown safe)`, m, mHeld };
  return { text: `inconclusive (${name(shipped)}: ${m.status}; ${name(held!)}: ${mHeld.status})`, m, mHeld };
}

const OWNER_COLUMNS = ['decision', 'site', 'reading', 'acted', 'acted groups', 'wrong', 'precision deff lower', 'dangerous / eligible', 'danger upper', 'R2 row .99 (candidate only)', 'note'];

function mRow(label: string, site: string, text: string, m: RuleM, note: string | null): Cell[] {
  return [label, site, text, m.prec?.n ?? null, m.prec?.groups ?? null, m.prec?.x ?? null, r4(m.prec?.lower ?? null),
    m.danger ? `${m.danger.x} / ${m.danger.n}` : null, m.danger ? dangerText(m.danger) : null, r4(m.r2row), note];
}

/** D1, D2, D5 (rule M and owner actions), the pixel scope, Q5/D4 OpenAI cells and Q17 readiness. */
export function ownerTables(ctx: Ctx, verdicts: ReadonlyMap<Site, SiteVerdict>, d3: string): { tables: Table[]; answers: Cell[][] } {
  const rows: Cell[][] = [];
  const d1 = ownerAction(ctx, 'page-state', 0.8, null, (t) => `${t}`);
  rows.push(mRow('D1', 'page-state', d1.text, d1.m, 'jev_gw at 0.8, N4 text native'));
  const d2 = ownerAction(ctx, 'dismiss', 0.6, 0.97, (t) => `${t}`);
  const d2band = band(d2.m.units, 0.6, 0.97, ctx.pool('dismiss'));
  const close = d2.m.units.filter((u) => u.acted);
  const split = `acts with a close word ${close.filter((u) => u.closeWord === true).length} (wrong ${close.filter((u) => u.closeWord === true && !u.correct).length}), without ${close.filter((u) => u.closeWord === false).length} (wrong ${close.filter((u) => u.closeWord === false && !u.correct).length})`;
  rows.push(mRow('D2', 'dismiss', d2.text, d2.m, `after the veto replay; ${split}; band [0.6, 0.97): ${d2band.n} acts, ${d2band.wrong} wrong [${r4(d2band.lower)}, ${r4(d2band.upper)}]`));
  if (d2.mHeld) rows.push(mRow('D2 at 0.97', 'dismiss', d2.mHeld.status, d2.mHeld, 'held fit (S3), not fitted on N3'));
  const d5 = ownerAction(ctx, 'presence', 0.85, 0.92, (t) => `${t}/.15`);
  rows.push(mRow('D5', 'presence', d5.text, d5.m, 'jev_gw at .85/.15, N6'));
  if (d5.mHeld) rows.push(mRow('D5 at .92', 'presence', d5.mHeld.status, d5.mHeld, 'held text-only fit'));
  const pxPage = pixelScope(ctx, 'page-state');
  const pxPresence = pixelScope(ctx, 'presence');
  const pixelRows = [...pxPage.rows, ...pxPresence.rows];
  // Q5/D4: OpenAI where it has a row (rule M, Q5 only) and where it has none (a row worth adding).
  const q5: Cell[][] = [];
  for (const [site, arm, note] of [['dismiss', 'oa_primary', 'the agree part at 0.6'], ['page-state', 'oa_primary', 'alone at 0.8'],
    ['presence', 'oa_s2', 'alone at .85/.15'], ['presence', 'oa_primary', 'inside agree at .85/.15']] as const) {
    const m = ruleM(ctx, site, arm);
    q5.push(mRow('D4 (rule M, Q5 only)', site, m.status, m, `${arm} ${note}`));
  }
  // The fallback's OpenAI branch is a Q5 cell too, so rule M (precision and danger) is read on it (5.6).
  const fb = ctx.cell('fallback', 'page-state', VERDICT_POOL['page-state']).units.filter((u) => u.branch === 'second' && u.origin === 'native');
  const fbM = ruleMOn(ctx, 'page-state', fb);
  q5.push(mRow('D4 (fallback branch, rule M, Q5 only)', 'page-state', fb.length === 0 ? ctx.miss('fallback rows with branch second at page-state') : fbM.status,
    fbM, 'OpenAI acts on Jev-abstained items'));
  for (const site of ['locate', 'find', 'outcome', 'option-map'] as const) {
    const jev = ctx.cell('jev_gw', site, VERDICT_POOL[site]).units;
    for (const arm of ['oa_s2', 'oa_primary']) {
      const units = ctx.cell(arm, site, VERDICT_POOL[site]).units;
      if (units.length === 0) { q5.push(['D4 (no row)', site, ctx.miss(`research rows of ${arm} at ${site}`), null, null, null, null, null, null, null, arm]); continue; }
      const r2 = r2Cell(units, 0.99, site, { pool: ctx.pool(site), floor: E99, resamples: 0 });
      const cov = (u: readonly Unit[]) => r2Coverage(u, 0.99, site);
      const diff = pairedDiff(pairUnits(jev, units), cov, ctx.i.resamples);
      const worth = r2.precision.verdict === 'pass' && diff.lower > -0.03;
      q5.push(['D4 (no row)', site, worth ? 'a row is worth adding' : 'not shown', r2.precision.n, r2.precision.groups, r2.precision.x,
        r4(r2.precision.lower), null, null, r4(r2.rows.all ?? r2.rows.none ?? null), `${arm}: R2 cov ${r4(r2.coverage)} vs jev_gw diff [${r4(diff.lower)}, ${r4(diff.upper)}]`]);
    }
  }
  const answers = readiness(ctx, verdicts, { d1, d2, d5, d3, pxPage, pxPresence, q5 });
  return {
    tables: [
      { anchor: 'owner', section: 1, title: 'Rule M and owner actions (D1, D2, D5)', columns: OWNER_COLUMNS, rows, notes: [
        `D1 text-only scope: page-state ${pxPage.text}; presence ${pxPresence.text}`, 'The cross-fitted R2 row is printed as a candidate only (fitted on the same data).'] },
      { anchor: 'pixel', section: 1, title: 'Pixel-only slice: dangerous acts per candidate route (D1 scope)', columns: ['site', 'route', 'sets', 'danger-eligible', 'dangerous', 'exact upper'], rows: pixelRows, notes: [] },
      { anchor: 'q5', section: 2, title: 'OpenAI rows (Q5, D4)', columns: OWNER_COLUMNS, rows: q5, notes: ['Rule M is read on these cells for Q5 only, never Q17.'] },
      { anchor: 'answers', section: 1, title: 'Answers for the owner (D1-D5, Q17)', columns: ['decision', 'reading', 'blocking reasons / note'], rows: answers, notes: [] },
    ],
    answers,
  };
}

/** Q17 (5.6) and the 9.1 item 1 answers: each owner decision's reading with its blocking reasons mapped. */
function readiness(ctx: Ctx, verdicts: ReadonlyMap<Site, SiteVerdict>, r: {
  d1: { text: string; m: RuleM }; d2: { text: string; m: RuleM }; d5: { text: string; m: RuleM }; d3: string;
  pxPage: { text: string; harm: boolean | null }; pxPresence: { text: string; harm: boolean | null }; q5: Cell[][];
}): Cell[][] {
  const reason = (status: string) => (status === 'fail' || status.startsWith('row unsafe') ? 'wrong acts'
    : status.startsWith('inconclusive (n') || status.includes('below D299') || status.includes('missing') ? 'data short' : status);
  const out: Cell[][] = [
    ['D1 page-state row', r.d1.text, `scope: ${r.pxPage.text}`], ['D2 dismiss row', r.d2.text, null], ['D3 locate write row', r.d3, null],
    ['D4 OpenAI rows', r.q5.map((row) => `${row[1]} ${String(row[10] ?? '')}: ${String(row[2])}`).join('; '), null],
    ['D5 presence row', r.d5.text, `pixel slice: ${r.pxPresence.text}`],
  ];
  for (const [site, m] of [['dismiss', r.d2.m], ['page-state', r.d1.m], ['presence', r.d5.m]] as const) {
    const blocking: string[] = [];
    if (!m.pass) blocking.push(`rule M on jev_gw: ${reason(m.status)}`);
    for (const e of verdicts.get(site)?.evals ?? []) if (e.status !== 'safe') blocking.push(`${e.cand.id}: ${reason(e.status)}`);
    if (site === 'page-state' && r.pxPage.harm !== false && !ctx.i.plan.ownerScopeRuled) blocking.push('owner scope (pixel-only pages; D1 scope unruled)');
    out.push([`Q17 ${site} ready for 1.0`, blocking.length === 0 ? 'ready' : 'blocked', blocking.join('; ') || null]);
  }
  return out;
}

/* ---------- 5.7: other questions ---------- */

/** An answer compared across rows by caller index (A1): the acted pick, else `abstain`. */
function answerOf(u: Unit): string {
  return u.acted ? (u.pick ?? 'acted') : 'abstain';
}

function byItem(units: readonly Unit[]): Map<string, Unit[]> {
  const m = new Map<string, Unit[]>();
  for (const u of units) m.set(`${u.arm}\0${u.site}\0${u.key}`, [...(m.get(`${u.arm}\0${u.site}\0${u.key}`) ?? []), u]);
  return m;
}

interface T29 { pairs: number; same: number | null; diff: number; lower: number; upper: number; drift: boolean }
const T29_CACHE = new WeakMap<Ctx, Map<string, T29>>();

/**
 * T29 for one (arm, site): the recheck rows against their P4a rows (by caller index); per recheck item, recheck
 * agreement (0/1) minus its own within-run r1-r3 agreement (0/1), paired group bootstrap; `drift` when lower and
 * the CI excludes 0. Cached per analysis.
 */
export function t29(ctx: Ctx, arm: string, site: string): T29 {
  const cache = T29_CACHE.get(ctx) ?? T29_CACHE.set(ctx, new Map()).get(ctx)!;
  const hit = cache.get(`${arm}\0${site}`);
  if (hit) return hit;
  const recheck = ctx.i.recheck.filter((u) => u.arm === arm && u.site === site);
  const interim = new Map(ctx.i.interimUnits.filter((u) => u.arm === arm && u.site === site && u.repeat === 'r1' && (u.order === 'p0' || u.order === 'fixed')).map((u) => [u.key, u]));
  const pairsR = recheck.filter((u) => interim.has(u.key)).map((u) => ({ key: u.key, group: u.group, a: interim.get(u.key)!, b: u }));
  const same = pairsR.length === 0 ? null : pairsR.filter((p) => answerOf(p.a) === answerOf(p.b)).length / pairsR.length;
  const repeats = byItem(ctx.i.interimUnits.filter((u) => u.arm === arm && u.site === site && (u.order === 'p0' || u.order === 'fixed')));
  const recs = pairsR.map((p) => {
    const reps = repeats.get(`${arm}\0${site}\0${p.key}`) ?? [];
    return { group: p.group, rec: answerOf(p.a) === answerOf(p.b) ? 1 : 0, within: reps.length >= 2 && new Set(reps.map(answerOf)).size === 1 ? 1 : 0 };
  });
  const diffOf = (rs: readonly { rec: number; within: number }[]) => rs.length === 0 ? Number.NaN : rs.reduce((a, r) => a + r.rec - r.within, 0) / rs.length;
  const draws = bootstrapDraws(recs, (r) => r.group, diffOf, { resamples: ctx.i.resamples });
  const out: T29 = { pairs: pairsR.length, same, diff: diffOf(recs), lower: drawAt(draws, 0.025), upper: drawAt(draws, 0.975), drift: false };
  out.drift = recs.length > 0 && out.diff < 0 && out.upper < 0;
  cache.set(`${arm}\0${site}`, out);
  return out;
}

/** ` drift` (T29) for a printed cell that pools P4a (`slice: interim`) and final P4 rows of an (arm, site) that drifted. */
export function driftMark(ctx: Ctx, arm: string, site: string, units: readonly Unit[]): string {
  const slices = new Set(units.map((u) => u.slice ?? 'final'));
  return slices.has('interim') && slices.has('final') && t29(ctx, arm, site).drift ? ' drift' : '';
}

/** Q12 and T29: one-answer share and acted flip rate per (arm, site); the recheck agreement against P4a beside. */
export function stabilityTable(ctx: Ctx): Table {
  const rows: Cell[][] = [];
  const cells = new Map<string, Unit[][]>();
  for (const [k, list] of byItem(ctx.i.allUnits)) {
    const [arm, site] = k.split('\0');
    cells.set(`${arm}\0${site}`, [...(cells.get(`${arm}\0${site}`) ?? []), list]);
  }
  const notes: string[] = [];
  for (const [k, items] of [...cells.entries()].sort()) {
    const [arm, site] = k.split('\0') as [string, string];
    const one = items.filter((list) => new Set(list.map(answerOf)).size === 1).length / items.length;
    const flips: number[] = [];
    for (const list of items) {
      const acted = list.filter((u) => u.acted);
      let pairs = 0;
      let differ = 0;
      for (let i = 0; i < acted.length; i += 1) for (let j = i + 1; j < acted.length; j += 1) { pairs += 1; if (acted[i]!.pick !== acted[j]!.pick) differ += 1; }
      if (pairs > 0) flips.push(differ / pairs);
    }
    const t = t29(ctx, arm, site);
    rows.push([arm, site, items.length, r4(one), r4(flips.length === 0 ? Number.NaN : flips.reduce((a, b) => a + b, 0) / flips.length), flips.length,
      t.same === null ? null : `${r4(t.same)} (${t.pairs})`, t.pairs === 0 ? null : `${r4(t.diff)} [${r4(t.lower)}, ${r4(t.upper)}]${t.drift ? ' drift' : ''}`]);
  }
  notes.push('Answers are compared by caller index; the flip rate is computed per item, then averaged over items with a pair of acted rows.');
  notes.push('T29 drift: the recheck same-answer share is printed beside; a cell pooling P4a and P4 rows carries `drift` when it is lower than the within-run r1-r3 agreement and the paired CI excludes 0 (see the drift column of the recheck table).');
  return { anchor: 'q12', section: 6, title: 'Stability (Q12) and the P4a recheck (T29)', columns: ['arm', 'site', 'items', 'one-answer share', 'acted flip rate', 'items with acted pairs', 'recheck same-answer share (n)', 'recheck - within-run agreement [CI]'], rows, notes };
}

/** Q9: `jev_gw` vs `jev_or` on the same `p0`/`r1` requests (equal digests). */
export function routeTable(ctx: Ctx): Table {
  const rows: Cell[][] = [];
  for (const site of SITES) {
    const gw = new Map(ctx.i.units.filter((u) => u.arm === 'jev_gw' && u.site === site && u.digest !== null).map((u) => [u.digest!, u]));
    const pairs = ctx.i.units.filter((u) => u.arm === 'jev_or' && u.site === site && u.digest !== null && gw.has(u.digest!)).map((u) => ({ a: gw.get(u.digest!)!, b: u }));
    if (pairs.length === 0) { rows.push([site, 0, null, null, ctx.miss(`jev_gw and jev_or rows with equal digests at ${site}`), null, null]); continue; }
    const same = pairs.filter((p) => (p.a.pick ?? 'none') === (p.b.pick ?? 'none')).length / pairs.length;
    const deltas = pairs.filter((p) => p.a.score !== null && p.b.score !== null).map((p) => Math.abs(p.a.score! - p.b.score!)).sort((x, y) => x - y);
    const median = deltas.length === 0 ? Number.NaN : deltas[Math.floor((deltas.length - 1) / 2)]!;
    // Both M1 (T_ask): the arms themselves, never jev_gw's M2 production route (T_decision).
    const tg = ctx.timingOf('jev_gw', site);
    const to = ctx.timingOf('jev_or', site);
    const ci = tg.length > 0 && to.length > 0 ? pairedPercentile(to, tg, 0.5, ctx.i.resamples) : null;
    const drift = driftMark(ctx, 'jev_gw', site, pairs.map((p) => p.a)) || driftMark(ctx, 'jev_or', site, pairs.map((p) => p.b));
    rows.push([site, pairs.length, r4(same), r4(median), `${same >= 0.95 && median <= 0.02 ? 'same answers' : 'answers differ'}${drift}`,
      ci ? `${r4(ci.estimate)} [${r4(ci.lower)}, ${r4(ci.upper)}]` : ctx.miss(`P6 M1 rows of jev_gw or jev_or at ${site}`), ci ? r4(ci.p) : null]);
  }
  return { anchor: 'q9', section: 6, title: 'Jev route (Q9): jev_gw vs jev_or', columns: ['site', 'pairs', 'same chosen key share', 'median |delta confidence|', 'reading', 'p50 T_ask jev_or - jev_gw [CI]', 'bootstrap p'], rows,
    notes: ['Only jev_gw enters verdicts; jev_or answers the route and default-config questions.'] };
}

/** Q11: masks on vs off on paired items (N10, S4). */
export function piiTable(ctx: Ctx, egress: { checked: number; hits: string[]; unlisted?: string[] } | null): Table {
  const rows: Cell[][] = [];
  // A pair shares its item's `base` (S4: `pii-001~masks-on` / `~masks-off`), else the id without its mask suffix.
  const bareId = (item: string) => item.replace(/[-_:.~](masks-?)?(on|off)$/i, '');
  const metaOf = (u: Unit) => ctx.i.meta.get(u.key) ?? ctx.i.meta.get(`${u.set}:${bareId(u.item)}`);
  const baseOf = (u: Unit) => { const b = metaOf(u)?.base; return typeof b === 'string' ? b : bareId(u.item); };
  const pairKey = (u: Unit) => `${u.arm}\0${u.set}:${baseOf(u)}`;
  const sets = ['N10', 'S4'];
  for (const arm of [...new Set(ctx.i.units.filter((u) => sets.includes(u.set)).map((u) => u.arm))].sort()) {
    const units = ctx.i.units.filter((u) => u.arm === arm && sets.includes(u.set) && !u.familyBad);
    const on = new Map(units.filter((u) => u.masks).map((u) => [pairKey(u), u]));
    const pairs = units.filter((u) => !u.masks && on.has(pairKey(u))).map((u) => ({ key: u.key, group: u.group, a: on.get(pairKey(u))!, b: u }));
    const moves = (p: { a: Unit }) => metaOf(p.a)?.mask_changes_gold;
    if (pairs.length === 0 || pairs.every((p) => moves(p) === undefined)) { rows.push([arm, pairs.length, null, null, null, null, ctx.miss(`masks on/off pairs with mask metadata for ${arm}`)]); continue; }
    const keep = pairs.filter((p) => moves(p) === false && metaOf(p.a)?.mask_class !== 'unmasked');
    const unmasked = pairs.filter((p) => metaOf(p.a)?.mask_class === 'unmasked');
    const removed = pairs.filter((p) => moves(p) === true);
    const mc = mcnemarPairs(keep, (u) => u.acted && u.correct);
    const changed = keep.filter((p) => answerOf(p.a) !== answerOf(p.b)).length;
    const cp = clopperPearson(changed, keep.length, 0.025);
    const rightAbstain = removed.filter((p) => !p.a.acted).length;
    rows.push([arm, keep.length, `${r4(mc.p)} (${mc.b}/${mc.c})`, `${changed} [${r4(cp.lower)}, ${r4(cp.upper)}]`,
      `${rightAbstain} / ${removed.length}`, `${unmasked.length} unmasked-by-design pairs, ${unmasked.filter((p) => answerOf(p.a) !== answerOf(p.b)).length} changed`, null]);
  }
  const notes = [egress === null ? ctx.miss('egress byte check (render --pii-egress)')
    : `egress byte check: ${egress.checked} approved masks-on requests, ${egress.hits.length} holding a masked source string${egress.hits.length > 0 ? ` (defect: ${egress.hits.join(', ')})` : ''}${(egress.unlisted ?? []).length > 0 ? `; ${egress.unlisted!.join('; ')}` : ''}`];
  return { anchor: 'q11', section: 6, title: 'PII masks (Q11): masks on vs off', columns: ['arm', 'must-not-move pairs', 'McNemar correct on vs off p (b/c)', 'answer changes [exact CI]',
    'right abstain on evidence-removal items', 'unmasked by design', 'note'], rows, notes };
}

/** p(true) of an ablation row (2.5): a Noul's score; for `K`, `probabilities.true`, else confidence or 1 - confidence. */
export function pTrue(raw: Record<string, unknown>): number | null {
  const a = raw.answer as { noul?: unknown; choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> } | null;
  if (!a) return null;
  if (typeof a.noul === 'number') return a.noul;
  if (typeof a.probabilities?.true === 'number') return a.probabilities.true;
  if (typeof a.confidence !== 'number') return null;
  return a.choice === 'true' ? a.confidence : 1 - a.confidence;
}

const VARIANTS = ['W0', 'W1', 'W2', 'W3', 'K', 'C1'] as const;
type P5Unit = Inputs['p5'][number];

/** The 2.5 item kind: N7's abstract or concrete, the doctor-ping item, else its set (S2, P1 sample). */
function kindOf(ctx: Ctx, u: P5Unit): string {
  const m = ctx.i.meta.get(u.key);
  const text = `${String(m?.kind ?? '')} ${String(m?.condition ?? '')} ${u.condition}`;
  if (/abstract/i.test(text)) return 'abstract';
  if (/concrete/i.test(text)) return 'concrete';
  if (u.item === DOCTOR_PING_ITEM.id) return 'doctor ping';
  return u.set;
}

interface Edge { yesEdge: number; falseYes: number; meanTrue: number; meanFalse: number; nTrue: number; nFalse: number }

function edges(units: readonly { gold: string; p: number | null }[]): Edge {
  const t = units.filter((u) => u.gold === 'true' && u.p !== null);
  const f = units.filter((u) => u.gold === 'false' && u.p !== null);
  const mean = (xs: typeof t) => (xs.length === 0 ? Number.NaN : xs.reduce((a, u) => a + u.p!, 0) / xs.length);
  return { yesEdge: t.length === 0 ? Number.NaN : t.filter((u) => u.p! >= 0.85).length / t.length,
    falseYes: f.length === 0 ? Number.NaN : f.filter((u) => u.p! >= 0.85).length / f.length,
    meanTrue: mean(t), meanFalse: mean(f), nTrue: t.length, nFalse: f.length };
}

/** Q7/Q8 wording ablation (2.5): every cell x kind x gold, differences from W0 with grouped CIs, interaction, selection, drift. */
export function ablationTable(ctx: Ctx): Table[] {
  const ab = ctx.i.p5.filter((u) => (VARIANTS as readonly string[]).includes(u.variant) && u.repeat === 'r1')
    .map((u) => ({ ...u, p: pTrue(u.raw), kind: kindOf(ctx, u) }));
  if (ab.length === 0) {
    return [{ anchor: 'q7', section: 4, title: 'Wording ablation (Q7, Q8)', columns: ['reading'], rows: [[ctx.miss('P5 ablation rows')]], notes: [] }];
  }
  const rows: Cell[][] = [];
  const diffs: Cell[][] = [];
  const arms = [...new Set(ab.map((u) => u.arm))].sort();
  const kinds = [...new Set(ab.map((u) => u.kind))].sort();
  type AbU = (typeof ab)[number];
  const yesEdgeOf = (us: readonly AbU[]) => edges(us).yesEdge;
  for (const arm of arms) for (const variant of VARIANTS) {
    const cell = ab.filter((u) => u.arm === arm && u.variant === variant);
    if (cell.length === 0) continue;
    for (const kind of ['all', ...kinds]) {
      const e = edges(kind === 'all' ? cell : cell.filter((u) => u.kind === kind));
      rows.push([arm, variant, kind, e.nTrue, e.nFalse, r4(e.yesEdge), r4(e.falseYes), r4(e.meanTrue), r4(e.meanFalse)]);
    }
    if (variant === 'W0') continue;
    const w0 = new Map(ab.filter((u) => u.arm === arm && u.variant === 'W0').map((u) => [u.key, u]));
    const paired = cell.filter((u) => w0.has(u.key)).map((u) => ({ group: u.group, x: u, w: w0.get(u.key)! }));
    const effect = (ps: readonly typeof paired[number][], kind?: string) => {
      const sel = kind === undefined ? ps : ps.filter((p) => p.x.kind === kind);
      return yesEdgeOf(sel.map((p) => p.x)) - yesEdgeOf(sel.map((p) => p.w));
    };
    const ci = (stat: (ps: readonly typeof paired[number][]) => number) => {
      const d = bootstrapDraws(paired, (p) => p.group, stat, { resamples: ctx.i.resamples });
      return `${r4(stat(paired))} [${r4(drawAt(d, 0.025))}, ${r4(drawAt(d, 0.975))}]`;
    };
    const fy = (ps: readonly typeof paired[number][]) => edges(ps.map((p) => p.x)).falseYes - edges(ps.map((p) => p.w)).falseYes;
    diffs.push([arm, variant, paired.length, ci((ps) => effect(ps)), ci(fy), ci((ps) => effect(ps, 'abstract') - effect(ps, 'concrete'))]);
  }
  const selection: Cell[][] = [];
  for (const arm of arms) {
    const dev = (u: AbU) => foldOfDev(u.group);
    const devEdge = (variant: string, half: boolean) => edges(ab.filter((u) => u.arm === arm && u.variant === variant && dev(u) === half));
    const w0 = devEdge('W0', true);
    const ok = ['W1', 'W2', 'W3', 'K', 'C1'].filter((v) => { const e = devEdge(v, true); return e.falseYes === 0 && e.yesEdge >= w0.yesEdge + 0.10; });
    const best = ok.sort((a, b) => devEdge(b, true).yesEdge - devEdge(a, true).yesEdge)[0];
    if (best === undefined) { selection.push([arm, 'no candidate', null, null]); continue; }
    const held = ab.filter((u) => u.arm === arm && u.variant === best && !dev(u) && u.gold === 'true' && u.p !== null);
    const x = held.filter((u) => u.p! >= 0.85).length;
    const cp = clopperPearson(x, held.length, 0.025);
    selection.push([arm, best, `${x}/${held.length}`, `[${r4(cp.lower)}, ${r4(cp.upper)}]`]);
  }
  const drift = driftRows(ctx);
  return [
    { anchor: 'q7', section: 4, title: 'Wording ablation (Q7, Q8): every cell x kind', columns: ['arm', 'variant', 'kind', 'gold-true n', 'gold-false n', 'yes_edge', 'false_yes', 'mean p(true) | true', 'mean p(true) | false'], rows,
      notes: ['Minimum detectable effect: a held-out kind x gold cell holds ~15 items, so only a yes_edge difference of ~0.35 or more is detectable; ~0.2 on all items. Smaller effects are "not shown", never "no effect".'] },
    { anchor: 'q7-diff', section: 4, title: 'Wording ablation: differences from W0 on the same arm (paired grouped bootstrap)', columns: ['arm', 'variant', 'paired items', 'yes_edge - W0 [CI]', 'false_yes - W0 [CI]', 'abstract - concrete W-effect [CI]'], rows: diffs,
      notes: ['The wording x kind interaction is the difference of the W-effect between abstract and concrete items; one-factor summaries are secondary, never the attribution.'] },
    { anchor: 'q7-candidate', section: 4, title: 'Wording ablation: candidate variant (dev half), quoted on the held-out half', columns: ['arm', 'candidate', 'held-out yes_edge', 'exact CI'], rows: selection,
      notes: ['Adopting any variant needs a new calibration; nothing is adopted here.'] },
    drift,
  ];
}

/** 2.5 dev half: group sha256(`refsure-bench-20261016:` + group) first byte mod 10 < 5. */
function foldOfDev(group: string): boolean {
  return foldOf(group) < 5;
}

/**
 * 2.5 drift since the prior run: P5 rows of variant `drift` (byte-identical P1 bodies re-asked on `oa_primary`, 3
 * repeats) each carry the prior stored answer as `prior: {p_true}`; an item drifts when any repeat's p(true) differs
 * by > 0.01. Bodies that differ are listed by the runner and left out here.
 */
function driftRows(ctx: Ctx): Table {
  const rows = ctx.i.p5.filter((u) => u.variant === 'drift');
  const byItem = new Map<string, { group: string; drift: boolean; missing: boolean }>();
  for (const u of rows) {
    const prior = (u.raw.prior as { p_true?: unknown } | undefined)?.p_true;
    const p = pTrue(u.raw);
    const rec = byItem.get(u.key) ?? { group: u.group, drift: false, missing: false };
    if (typeof prior !== 'number' || p === null) rec.missing = true;
    else if (Math.abs(p - prior) > 0.01) rec.drift = true;
    byItem.set(u.key, rec);
  }
  const recs = [...byItem.values()].filter((r) => !r.missing);
  const x = recs.filter((r) => r.drift).length;
  const cp = clopperPearson(x, recs.length, 0.025);
  const reading: Cell[] = recs.length === 0 ? [ctx.miss('P5 drift rows with prior p(true)'), null, null, null]
    : [`${x}/${recs.length}`, r4(x / recs.length), `[${r4(cp.lower)}, ${r4(cp.upper)}]`, byItem.size - recs.length];
  return { anchor: 'q7-drift', section: 4, title: 'Drift since the prior run (P1 byte-identical re-ask on oa_primary)', columns: ['drifted items', 'drift', 'exact CI', 'items without a prior answer'],
    rows: [reading], notes: ['The route factor (gateway vs direct) is inconclusive by design: OpenAI is reachable only through the gateway.'] };
}

/** Q6 (2.6, 5.7): v1 vs fresh descriptor lines per site and provider (majority of 3 rows), and drift of the descriptor re-ask. */
export function formatTable(ctx: Ctx): Table {
  // A descriptor row carries set `n11`; its v1 twin is the same item in its own set (`v1_set`, 2.6), so key it there.
  const desc = ctx.i.p5.filter((u) => /_desc$/.test(u.arm) && !u.familyBad)
    .map((u) => (typeof u.raw.v1_set === 'string' ? { ...u, key: `${canonSet(u.raw.v1_set, ctx.i.plan)}:${u.item}` } : u));
  if (desc.length === 0) return { anchor: 'q6', section: 5, title: 'Line format v1 vs descriptor lines (Q6)', columns: ['reading'], rows: [[ctx.miss('descriptor re-ask rows (arms *_desc)')]], notes: [] };
  const majority = (list: readonly Unit[]): { correct: boolean } => {
    const counts = new Map<string, { n: number; u: Unit }>();
    for (const u of list) { const a = answerOf(u); counts.set(a, { n: (counts.get(a)?.n ?? 0) + 1, u }); }
    const top = [...counts.values()].find((c) => c.n >= 2);
    return { correct: top !== undefined && top.u.acted && top.u.correct };
  };
  const v1Rows = (u: Unit) => CANDIDATE.has(u.site) ? (u.order === 'p0' && u.repeat === 'r1') || ((u.order === 'rb1' || u.order === 'rb2') && u.repeat === 'r1') : u.order === 'fixed';
  const rows: Cell[][] = [];
  const ps: number[] = [];
  for (const [arm, v1arm] of [['jev_gw_desc', 'jev_gw'], ['oa_primary_desc', 'oa_primary']] as const) {
    for (const site of ['locate', 'dismiss', 'page-state', 'outcome'] as const) {
      const d = desc.filter((u) => u.arm === arm && u.site === site);
      if (d.length === 0) { rows.push([site, v1arm, 0, null, null, null, ctx.miss(`descriptor rows ${arm} at ${site}`)]); continue; }
      const keys = [...new Set(d.map((u) => u.key))].sort();
      const recs = keys.map((key) => {
        const dl = d.filter((u) => u.key === key);
        const vl = ctx.i.allUnits.filter((u) => u.arm === v1arm && u.key === key && v1Rows(u) && !u.familyBad);
        const prior = dl.map((u) => (u.raw.prior as { correct?: unknown } | undefined)?.correct);
        return { group: dl[0]!.group, v1: vl.length >= 3 ? (majority(vl).correct ? 1 : 0) : null, desc: majority(dl).correct ? 1 : 0,
          prior: prior.every((p) => typeof p === 'boolean') ? (prior.filter(Boolean).length >= 2 ? 1 : 0) : null };
      });
      const fmt = recs.filter((r) => r.v1 !== null);
      const stat = (rs: readonly typeof recs[number][], f: (r: typeof recs[number]) => number) => rs.length === 0 ? Number.NaN : rs.reduce((a, r) => a + f(r), 0) / rs.length;
      const ciOf = (rs: typeof recs, f: (r: typeof recs[number]) => number) => {
        const dr = bootstrapDraws(rs, (r) => r.group, (x) => stat(x, f), { resamples: ctx.i.resamples });
        const share = (f2: (v: number) => boolean) => dr.filter(f2).length / Math.max(1, dr.length);
        const p = Math.min(1, 2 * Math.min(share((v) => v <= 0), share((v) => v >= 0)));
        return { est: stat(rs, f), lo: drawAt(dr, 0.025), hi: drawAt(dr, 0.975), p };
      };
      const f = ciOf(fmt, (r) => r.v1! - r.desc);
      const drifted = recs.filter((r) => r.prior !== null);
      const dr = drifted.length === 0 ? null : ciOf(drifted, (r) => r.desc - r.prior!);
      ps.push(f.p);
      const say = (c: { lo: number; hi: number }, pos: string, neg: string) => (c.lo > 0 ? pos : c.hi < 0 ? neg : 'no difference shown');
      rows.push([site, v1arm, fmt.length, `${r4(f.est)} [${r4(f.lo)}, ${r4(f.hi)}]`, say(f, 'v1 gains', 'v1 loses'),
        dr ? `${r4(dr.est)} [${r4(dr.lo)}, ${r4(dr.hi)}] ${say(dr, 'differs', 'differs')}` : ctx.miss(`prior stored answers on ${arm} at ${site}`), r4(f.p)]);
    }
  }
  const adj = holm(ps);
  let i = 0;
  for (const row of rows) if (typeof row[6] === 'number') row.push(r4(adj[i++] ?? null));
  return { anchor: 'q6', section: 5, title: 'Line format v1 vs descriptor lines (Q6)', columns: ['site', 'provider arm', 'items', 'v1 - descriptor accuracy [CI]', 'format reading', 'drift: fresh - prior descriptor [CI]', 'bootstrap p', 'Holm p'], rows,
    notes: ['A split majority scores as not correct; page-state and outcome lines pass through unchanged (drift check only).'] };
}

/** Q8: `oa_s2` minus `oa_primary` per site on the same rows: R1 coverage and precision, R2 coverage at P*. */
export function renderingTable(ctx: Ctx): Table {
  const rows: Cell[][] = [];
  const ps: number[] = [];
  const precision = (us: readonly Unit[]) => { const a = us.filter((u) => u.acted); return a.length === 0 ? Number.NaN : a.filter((u) => u.correct).length / a.length; };
  for (const site of SITES) {
    const pairs = pairUnits(ctx.cell('oa_primary', site, VERDICT_POOL[site]).units, ctx.cell('oa_s2', site, VERDICT_POOL[site]).units);
    if (pairs.length === 0) { rows.push([site, 0, null, null, null, ctx.miss(`paired oa_s2 and oa_primary rows at ${site}`)]); continue; }
    const cov = pairedDiff(pairs, coverageOf, ctx.i.resamples);
    const prec = pairedDiff(pairs, precision, ctx.i.resamples);
    const r2 = pairedDiff(pairs, (us) => r2Coverage(us, pStarOf(site), site), ctx.i.resamples);
    ps.push(cov.p, prec.p, r2.p);
    const say = (d: { lower: number; upper: number }) => (d.lower > 0 || d.upper < 0 ? 'differs' : 'no difference shown');
    rows.push([site, pairs.length, `${r4(cov.estimate)} [${r4(cov.lower)}, ${r4(cov.upper)}] ${say(cov)}`,
      `${r4(prec.estimate)} [${r4(prec.lower)}, ${r4(prec.upper)}] ${say(prec)}`, `${r4(r2.estimate)} [${r4(r2.lower)}, ${r4(r2.upper)}] ${say(r2)}`,
      `p ${r4(cov.p)}, ${r4(prec.p)}, ${r4(r2.p)}`]);
  }
  const adj = holm(ps);
  let i = 0;
  for (const row of rows) if (typeof row[5] === 'string' && row[5].startsWith('p ')) { row.push(`Holm ${r4(adj[i])}, ${r4(adj[i + 1])}, ${r4(adj[i + 2])}`); i += 3; }
  return { anchor: 'q8', section: 4, title: 'Rendering (Q8): oa_s2 - oa_primary per site', columns: ['site', 'pairs', 'R1 coverage diff [CI]', 'precision diff [CI]', 'R2 coverage diff at P* [CI]', 'bootstrap p', 'Holm p'], rows, notes: [] };
}

/** Q13 (4.4): every M1 arm and M2 route per site, with the Holm-adjusted "faster" statements. */
export function timingTables(ctx: Ctx): Table[] {
  const rows: Cell[][] = [];
  const faster: Cell[][] = [];
  const ps: number[] = [];
  const index: Cell[][] = [];
  for (const site of SITES) {
    const arms = [...new Set(ctx.i.timing.filter((r) => r.site === site).map((r) => `${r.mode}\0${r.arm}`))].sort();
    if (arms.length === 0) { rows.push([site, null, null, 0, ctx.miss(`P6 rows at ${site}`), ...Array(12).fill(null)]); continue; }
    for (const k of arms) {
      const [mode, arm] = k.split('\0') as [string, string];
      const t = timingCell(ctx.i.timing.filter((r) => r.site === site && r.arm === arm), { fallback: arm === 'm2_fallback', resamples: ctx.i.resamples });
      rows.push([site, mode, arm, t.rows, t.cacheExcluded, fmtMs(t.p50), fmtMs(t.p95), `[${fmtMs(t.p95Ci.lower)}, ${fmtMs(t.p95Ci.upper)}]`,
        t.p95Os ? `[${fmtMs(t.p95Os.lower)}, ${fmtMs(t.p95Os.upper)}]` : null, `${r4(t.failShare)}${t.failures ? ' failures' : ''}`,
        t.overDecision10k === null ? r4(t.overBudget) : `part ${r4(t.overPart)}; Decision@10k ${r4(t.overDecision10k)}`,
        `${fmtMs(t.byRepeat.r1.p50)}/${fmtMs(t.byRepeat.r1.p95)} vs ${fmtMs(t.byRepeat.later.p50)}/${fmtMs(t.byRepeat.later.p95)}`,
        `${fmtMs(t.byCached.yes.p50)}/${fmtMs(t.byCached.yes.p95)} (n ${t.byCached.yes.n}) vs ${fmtMs(t.byCached.no.p50)}/${fmtMs(t.byCached.no.p95)}`,
        `${fmtMs(t.unflagged.p50)}/${fmtMs(t.unflagged.p95)} (n ${t.unflagged.n})`, `${r4(t.load.p50)}/${r4(t.load.max)}`]);
      if (mode === 'M2') {
        const tr = ctx.i.timing.filter((r) => r.site === site && r.arm === arm && r.rowIndex !== null);
        const max = Math.max(0, ...tr.map((r) => r.rowIndex!));
        const third = (lo: number, hi: number) => fmtMs(timingCell(tr.filter((r) => r.rowIndex! >= lo && r.rowIndex! < hi), { resamples: 0 }).p50);
        if (tr.length > 0) index.push([site, arm, third(0, max / 3), third(max / 3, (2 * max) / 3), third((2 * max) / 3, max + 1)]);
      }
    }
    for (const mode of ['M1', 'M2']) {
      const ids = arms.filter((k) => k.startsWith(`${mode}\0`)).map((k) => k.split('\0')[1]!);
      for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) for (const q of [0.5, 0.95]) {
        const a = ctx.i.timing.filter((r) => r.site === site && r.arm === ids[i]);
        const b = ctx.i.timing.filter((r) => r.site === site && r.arm === ids[j]);
        const d = pairedPercentile(a, b, q, ctx.i.resamples);
        if (d.n === 0) continue;
        ps.push(d.p);
        const said = d.upper < 0 ? `${ids[i]} faster` : d.lower > 0 ? `${ids[j]} faster` : 'no difference shown';
        faster.push([site, mode, `${ids[i]} - ${ids[j]}`, q === 0.5 ? 'p50' : 'p95', `${r4(d.estimate)} [${r4(d.lower)}, ${r4(d.upper)}]`, said, r4(d.p), d.infDraws]);
      }
    }
  }
  const adj = holm(ps);
  faster.forEach((row, i) => { row.push(r4(adj[i] ?? null)); if ((adj[i] ?? 1) >= 0.05 && String(row[5]).endsWith('faster')) row[5] = `${String(row[5])} (not after Holm)`; });
  return [
    { anchor: 'q13', section: 2, title: 'Timing (Q13): p50/p95 per site, arm (M1, T_ask) and route (M2, T_decision)', columns: ['site', 'mode', 'arm or route', 'rows', 'cache-served excluded', 'p50', 'p95', 'p95 CI (group bootstrap)',
      'p95 CI (order statistic, iid)', 'no-answer share', 'over budget', 'r1 vs r2/r3 p50/p95', 'cached tokens yes vs no p50/p95', 'without flagged rows p50/p95', 'loadavg1 p50/max'], rows,
    notes: ['Nearest-rank percentiles; a row without an answer ranks +inf; over 2% of such rows marks the cell `failures`. The flagged-row reading is sensitivity only.'] },
    { anchor: 'q13-faster', section: 2, title: 'Timing: "A is faster than B" (paired group bootstrap, Holm within this table)', columns: ['site', 'mode', 'A - B', 'percentile', 'difference ms [CI]', 'statement', 'bootstrap p', 'draws on +inf', 'Holm p'], rows: faster, notes: [] },
    { anchor: 'q13-index', section: 2, title: 'M2 T_decision p50 by row index within a repeat (thirds)', columns: ['site', 'route', 'first third', 'middle third', 'last third'], rows: index, notes: [] },
  ];
}

/**
 * 3.3 and T4 slices: every verdict-pool cell (and every other set) by language, origin and template, where a slice
 * holds >= 30 items. Descriptive only; never a verdict.
 */
export function sliceTable(ctx: Ctx): Table {
  const rows: Cell[][] = [];
  const dims: [string, (u: Unit) => string][] = [
    ['lang', (u) => (['en', 'uk', 'ru'].includes(u.lang) ? u.lang : 'other')], ['origin', (u) => u.origin],
    ['template', (u) => String(ctx.i.meta.get(u.key)?.template ?? 'unknown')],
  ];
  for (const site of SITES) for (const arm of armsAt(ctx, site)) {
    const units = [...ctx.i.units, ...ctx.i.combos].filter((u) => u.arm === arm && u.site === site && !u.visualOnly && !u.familyBad);
    for (const [dim, of] of dims) {
      const values = [...new Set(units.map(of))].sort();
      if (values.length < 2) continue;
      for (const v of values) {
        const sl = units.filter((u) => of(u) === v);
        if (sl.length < 30) continue;
        const s = summarize(sl);
        rows.push([site, `${arm}${driftMark(ctx, arm, site, sl)}`, dim, v, s.items, s.acted, s.wrong, r4(s.coverage), r4(s.precision)]);
      }
    }
  }
  return { anchor: 'slices', section: 2, title: 'Slices by language, origin and template (3.3, T4; >= 30 items, every set pooled, descriptive)', columns: ['site', 'arm or combo', 'slice', 'value', 'items', 'acted', 'wrong', 'coverage', 'precision'], rows,
    notes: ['Page-state and outcome are reported per origin (stored vs native) and pooled; verdicts read the native held-out pool only.',
      '`drift` (T29) marks a slice that pools P4a and final P4 rows of an arm and site whose recheck drifted (Q12 table).'] };
}

/** Q14 and 9.1 item 9: $ per 1,000 Decisions (attempt 1, unit rows) and per settled answer, per site and arm or combo. */
export function costTable(ctx: Ctx, crosscheck: Record<string, unknown> | null): Table {
  const rows: Cell[][] = [];
  for (const site of SITES) for (const arm of armsAt(ctx, site)) {
    const units = ctx.cell(arm, site, VERDICT_POOL[site]).units;
    if (units.length === 0) continue;
    const c = usdPer1000(units);
    const cov = coverageOf(units);
    rows.push([site, arm, units.length, r4(c.usd), r4(c.usd / 1000 / cov), c.unpriced]);
  }
  const notes = ['Priced on attempt 1 of the p0/r1 (candidate sites) or r1 rows: the 7.2 table x that attempt\'s usage; the direct Jev arm reads its own usage.cost; a combo sums the parts it asked.'];
  notes.push(crosscheck === null ? ctx.miss('spend-crosscheck.json (spend.ts)') : `cross-check (7.3): ${JSON.stringify(crosscheck)}`);
  return { anchor: 'q14', section: 9, title: 'Cost (Q14): $ per 1,000 Decisions and per settled answer, verdict cells', columns: ['site', 'arm or combo', 'items', '$ / 1,000 Decisions', '$ / settled answer', 'unpriced rows'], rows, notes };
}
