import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISMISS_START, CHOICE_START, LOCATE_ROWS, NOUL_BAND } from '../../../src/questions/sites/starting-thresholds';
import { priceUsage } from '../lib/guards';
import { latestByKey, ledgerFiles, readRows } from '../lib/ledger';
import type { QualityRow } from '../lib/ledger';
import {
  BENCH_SEED, anovaIcc, bootstrapDraws, binomCdf, clopperPearson, D299, drawAt, foldOf, kish, mcnemarExact, nearestRank,
  orderStatisticCi, pickRho,
} from '../lib/stats';

/*
  Section 5 and 4.4 readings over the committed ledgers: the per-item unit draw (3.1, 5.1), the deff-adjusted
  precision and danger rules (3.1), R2 matched precision with folds, risk classes and floors (5.3), paired
  comparisons (5.4) and the timing cells of 4.4. Pure functions over rows; analyze/verdict.ts applies the rules of
  5.5-5.7 and analyze/render.ts writes the tables. A missing input never reads as zero: callers get `null` and print
  `inconclusive (missing <input>)`.
*/

export const SITES = ['locate', 'find', 'dismiss', 'page-state', 'outcome', 'presence', 'option-map'] as const;
export type Site = (typeof SITES)[number];
export const CANDIDATE: ReadonlySet<string> = new Set(['locate', 'find', 'dismiss', 'option-map']);
const FAILURE = /^(timeout|transport|http_\d+)$/;

/** What the analysis is told about the run: set files for item metadata, set-id aliases, arms read as direct. */
export interface Plan {
  /** Canonical set id -> frozen set file (item metadata: injected, twin, kind, pii, adjudicated, ...). */
  sets?: Record<string, string>;
  /** Ledger set id -> canonical id (for example a file name -> `F1`); otherwise the id upper-cased. */
  aliases?: Record<string, string>;
  /** Arms whose cost is the provider's own `usage.cost` (Q14: the direct Jev route); default `jev_or`. */
  directArms?: string[];
  /** D1: the owner has ruled the text-only scope (Q17). */
  ownerScopeRuled?: boolean;
  /** Bootstrap resamples (2,000 by the protocol; lower only for a smoke run, which the tables then name). */
  resamples?: number;
  /**
   * Canonical set id -> a file whose items fill metadata fields the frozen set file lacks, matched by the frozen
   * item's `base` (else its id); the frozen item's own fields win; `fields` limits what is filled. S4's native
   * capture drops `mask_changes_gold`, which its calibrate source carries (`{"from": ..., "fields":
   * ["mask_changes_gold"]}`); that source's `pii` lists mask classes, not source strings, so it is not filled.
   */
  metaFill?: Record<string, string | { from: string; fields?: string[] }>;
}

export function readPlan(path: string | undefined): Plan {
  return path === undefined ? {} : (JSON.parse(readFileSync(path, 'utf8')) as Plan);
}

/** The canonical set id of a ledger set id. */
export function canonSet(id: string, plan: Plan): string {
  return plan.aliases?.[id] ?? id.toUpperCase();
}

/** Item metadata from the frozen set files, by `<SET>:<item id>`. */
export type Meta = Map<string, Record<string, unknown>>;

function jsonItems(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function readMeta(plan: Plan): Meta {
  const meta: Meta = new Map();
  for (const [set, path] of Object.entries(plan.sets ?? {})) {
    const id = canonSet(set, plan);
    const spec = Object.entries(plan.metaFill ?? {}).find(([k]) => canonSet(k, plan) === id)?.[1];
    const from = typeof spec === 'string' ? spec : spec?.from;
    const fields = typeof spec === 'object' ? spec.fields : undefined;
    const pick = (item: Record<string, unknown>) => (fields === undefined ? item : Object.fromEntries(fields.filter((f) => f in item).map((f) => [f, item[f]])));
    const fill = new Map((from === undefined ? [] : jsonItems(from)).map((item) => [String(item.id), pick(item)]));
    for (const item of jsonItems(path)) {
      if (typeof item.id !== 'string') continue;
      const extra = fill.get(typeof item.base === 'string' ? item.base : item.id) ?? fill.get(item.id);
      meta.set(`${id}:${item.id}`, extra === undefined ? item : { ...extra, ...item });
    }
  }
  return meta;
}

/** Every arm dir and set name under `<results>/<phase>`. */
export function ledgerIndex(results: string, phase: string): { arm: string; set: string }[] {
  const dir = join(results, phase);
  if (!existsSync(dir)) return [];
  const out: { arm: string; set: string }[] = [];
  for (const arm of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const sets = new Set<string>();
    for (const name of readdirSync(join(dir, arm))) {
      const m = /^(.+?)(\.resume\d+)?\.jsonl(\.gz)?$/.exec(name);
      if (m) sets.add(m[1]!);
    }
    for (const set of [...sets].sort()) out.push({ arm, set });
  }
  return out;
}

/** The latest row per key over every (arm, set) ledger of one phase (7.4 reading order). */
export function phaseRows<T extends { row_key: string } = QualityRow>(results: string, phase: string): T[] {
  const out: T[] = [];
  for (const { arm, set } of ledgerIndex(results, phase)) {
    out.push(...latestByKey<T>(ledgerFiles(results, phase, arm, set)).values());
  }
  return out;
}

/** Rows of a ledger directory that holds no `row_key` (combo or P6 M2 rows keyed by their own fields). */
export function plainRows<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(join(at, entry.name));
      else if (/\.jsonl(\.gz)?$/.test(entry.name)) out.push(...readRows<T>(join(at, entry.name)));
    }
  };
  walk(dir);
  return out;
}

/** One act a unit offers at any row up to `score`: a caller index (or `true`) and its precedence among parts. */
export interface Offer { score: number; pick: string; prio: number }

/** One item's draw in one cell (3.1, 5.1): its `p0`/`r1` (candidate sites) or `r1` row, read as the Terms say. */
export interface Unit {
  key: string; set: string; item: string; group: string; site: Site; arm: string;
  risk: string | null; gold: string; alt: string[]; condition: string; origin: string; lang: string;
  answerable: boolean; dangerEligible: boolean;
  /** R1 after the replayed veto on dismiss (Terms); the before-settle reading is `actedBefore`. */
  acted: boolean; correct: boolean; dangerous: boolean; actedBefore: boolean; dangerousBefore: boolean;
  /** Dismiss veto and close word from the 2.7 replay; null when the row carries no settle inputs. */
  vetoed: boolean | null; closeWord: boolean | null;
  /** Still acted after the 2.7 replay (`Settled.acted`: veto, close word, name-class re-read); null without settle inputs. */
  reread: boolean | null;
  /** Caller index (choice) or `true` (Noul yes) the model leaned to, and the score refsure compares (2.2). */
  pick: string | null; score: number | null; twin: boolean; answered: boolean;
  /** What the unit may act on at a re-read row t: the highest-`prio` offer with score >= t (one per part). */
  offers: Offer[];
  failure: boolean; familyBad: boolean; visualOnly: boolean; masks: boolean; flags: string[];
  /** Attempt-1 priced dollars (Q14); null when attempt 1 answered without a priceable usage. */
  usd1: number | null; digest: string | null; threshold: number | null;
  /** Combos: which part settled (`first`/`second`), null when none did. */
  branch?: string | null;
  /** The row's order and repeat (Q12, T29); `slice` = `interim` for a P4a row, else `final`. */
  order?: string; repeat?: string; slice?: string;
  /** Combos: the single arms of its parts, in order. */
  partArms?: string[];
}

function truths(gold: string, alt: readonly string[]): Set<string> {
  return new Set([gold, ...alt]);
}

/** Gold-answerable (5.1): gold a candidate, every page-state item, gold true on presence/outcome. */
export function answerableOf(site: string, gold: string, alt: readonly string[]): boolean {
  if (CANDIDATE.has(site)) return gold !== 'none';
  if (site === 'page-state') return true;
  return truths(gold, alt).has('true');
}

function dangerOf(site: string, gold: string): boolean {
  if (CANDIDATE.has(site)) return gold === 'none';
  if (site === 'page-state') return gold !== 'expected';
  return gold === 'false';
}

/** The yes edge or Choice row of a stored threshold. */
export function edgeOf(threshold: unknown): number | null {
  if (typeof threshold === 'number') return threshold;
  if (threshold && typeof threshold === 'object' && typeof (threshold as { yesAtLeast?: unknown }).yesAtLeast === 'number') {
    return (threshold as { yesAtLeast: number }).yesAtLeast;
  }
  return null;
}

/** The model's lean and score from a stored answer (`{type, choice, confidence}` or `{type, noul}`). */
export function leanOf(row: Pick<QualityRow, 'answer' | 'presented' | 'site'>): { pick: string | null; score: number | null } {
  const a = row.answer as { type?: string; choice?: unknown; confidence?: unknown; noul?: unknown } | null;
  if (!a || typeof a !== 'object') return { pick: null, score: null };
  if (typeof a.noul === 'number') return { pick: 'true', score: a.noul };
  if (typeof a.confidence !== 'number') return { pick: null, score: null };
  if (typeof a.choice !== 'string') return { pick: null, score: a.confidence };
  if (!CANDIDATE.has(row.site)) return { pick: a.choice, score: a.confidence };
  const index = row.presented?.[a.choice];
  return { pick: index === undefined || index === null ? null : String(index), score: a.confidence };
}

/** Attempt-1 dollars (Q14): the 7.2 table x that attempt's usage, or the provider's own `usage.cost` on a direct arm. */
export function usdAttempt1(row: QualityRow, direct: boolean): number | null {
  const first = row.attempts[0];
  if (!first) return row.status.startsWith('refused:') ? 0 : null;
  const usages = first.usage.filter((u) => u !== null && u !== undefined);
  if (direct) {
    const costs = usages.map((u) => (u as { cost?: unknown }).cost).filter((c): c is number => typeof c === 'number');
    if (costs.length > 0) return costs.reduce((a, b) => a + b, 0);
  } else {
    const priced = priceUsage(row.provider as 'jev' | 'openai', usages);
    if (priced !== null) return priced;
  }
  return first.status === 'ok' ? null : 0;
}

/** lib/settle.ts `Settled` (or its `inconclusive (no settle inputs)` string, read as no settle inputs). */
interface SettleRead { vetoed?: unknown; close_word?: unknown; acted?: unknown }

/**
 * The 3.1 group as the ledger stores it (`<ledger set id>:<group>`, run.ts and combos.ts), never re-namespaced:
 * folds, the dev half and every bootstrap hash or resample exactly this string, so a 9.3 recomputation reads the
 * ledger's `group` field as is. A bare group (no `:`) is namespaced with the ledger set id.
 */
export function storedGroup(group: string, ledgerSet: string): string {
  return group.includes(':') ? group : `${ledgerSet}:${group}`;
}

/** One ledger row read as a unit (5.1), with the dismiss veto applied after the R1 read (Terms, A1). */
export function toUnit(row: QualityRow, plan: Plan): Unit {
  const set = canonSet(row.set, plan);
  const actedBefore = row.r1?.verdict === 'answer';
  const settle = row.settle && typeof row.settle === 'object' ? (row.settle as SettleRead) : null;
  const vetoed = typeof settle?.vetoed === 'boolean' ? settle.vetoed : null;
  const reread = typeof settle?.acted === 'boolean' ? settle.acted : null;
  const vetoBlocks = row.site === 'dismiss' && vetoed === true;
  const correctBefore = actedBefore && row.correct === true;
  const dangerousBefore = actedBefore && row.dangerous === true;
  const { pick, score } = leanOf(row);
  return {
    key: `${set}:${row.item}`, set, item: row.item, group: storedGroup(row.group, row.set), slice: row.slice ?? 'final',
    site: row.site as Site, arm: row.arm, risk: row.risk, gold: row.gold, alt: row.alt ?? [], condition: row.condition ?? '',
    origin: row.origin, lang: row.lang ?? '', answerable: answerableOf(row.site, row.gold, row.alt ?? []),
    dangerEligible: row.danger_eligible ?? dangerOf(row.site, row.gold),
    acted: actedBefore && !vetoBlocks, correct: correctBefore && !vetoBlocks, dangerous: dangerousBefore && !vetoBlocks,
    actedBefore, dangerousBefore, vetoed, closeWord: typeof settle?.close_word === 'boolean' ? settle.close_word : null, reread,
    pick, score, twin: row.r1?.cause === 'twins',
    offers: pick !== null && score !== null && row.r1?.cause !== 'twins' && !vetoBlocks ? [{ score, pick, prio: 1 }] : [],
    answered: row.status === 'ok', failure: FAILURE.test(row.status),
    order: row.order, repeat: row.repeat, familyBad: row.family_ok === false, flags: row.flags ?? [], visualOnly: row.visual_only === true, masks: row.masks !== false,
    usd1: usdAttempt1(row, (plan.directArms ?? ['jev_or']).includes(row.arm)), digest: row.digest,
    threshold: edgeOf(row.threshold_r1),
  };
}

/** The unit row of an item (3.1): `p0`/`r1` on candidate sites, `fixed`/`r1` elsewhere, of the given variant. */
export function isUnitRow(row: Pick<QualityRow, 'site' | 'order' | 'repeat' | 'variant'>, variant = 'shipped'): boolean {
  return row.variant === variant && row.repeat === 'r1' && row.order === (CANDIDATE.has(row.site) ? 'p0' : 'fixed');
}

/** X7 pooled-set order: duplicates by `p0`/`r1` digest are counted once, keeping the first set in this order. */
export const X7_ORDER = ['F1', 'P2', 'V', 'S1', 'S2', 'S3', 'S4', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10',
  'P1', 'P3', 'P4', 'P4R', 'F2', 'F3', 'F4'];

/** What a cell holds after the 3.1/3.4/2.2 exclusions, and what was set aside (always printed). */
export interface CellUnits { units: Unit[]; family: number; x7: number; total: number }

/**
 * Units of one cell: the unit rows of `arm` at `site` over `sets` (canonical ids), `family_ok` false rows set aside
 * (2.2), visual-only rows only when `pixel` (X3), and X7 duplicates by digest dropped across sets.
 */
export function cellUnits(all: readonly Unit[], q: { arm: string; site: string; sets: readonly string[]; pixel?: boolean }): CellUnits {
  const inSets = new Set(q.sets);
  const picked = all.filter((u) => u.arm === q.arm && u.site === q.site && inSets.has(u.set) && u.visualOnly === (q.pixel ?? false));
  const rank = (set: string) => { const i = X7_ORDER.indexOf(set); return i < 0 ? X7_ORDER.length : i; };
  const ordered = [...picked].sort((a, b) => rank(a.set) - rank(b.set) || a.key.localeCompare(b.key));
  const seen = new Set<string>();
  const units: Unit[] = [];
  let family = 0;
  let x7 = 0;
  for (const u of ordered) {
    if (u.familyBad) { family += 1; continue; }
    if (u.digest !== null && q.sets.length > 1) {
      if (seen.has(u.digest)) { x7 += 1; continue; }
      seen.add(u.digest);
    }
    units.push(u);
  }
  return { units, family, x7, total: picked.length };
}

/** 2.2: a cell with more than 1% `family_ok` false rows reads `inconclusive (family)`. */
export function familyBlocked(cell: CellUnits): boolean {
  return cell.total > 0 && cell.family / cell.total > 0.01;
}

/** Acted, right and dangerous for an act on `pick` (Terms). */
export function judge(u: Pick<Unit, 'site' | 'gold' | 'alt'>, pick: string | null): { acted: boolean; correct: boolean; dangerous: boolean } {
  if (pick === null) return { acted: false, correct: false, dangerous: false };
  const t = truths(u.gold, u.alt);
  if (u.site === 'outcome' || u.site === 'presence') return { acted: true, correct: t.has('true'), dangerous: !t.has('true') };
  const correct = t.has(pick);
  if (u.site === 'page-state') return { acted: true, correct, dangerous: pick === 'expected' && !t.has('expected') };
  return { acted: true, correct, dangerous: !correct };
}

/**
 * The unit re-read at another row `t` (a Choice row or a Noul yes edge): the highest-precedence offer with score
 * >= t. A vetoed dismiss pick and a known sent twin offer nothing. A low-confidence lean on a sent twin is not
 * known as a twin (the row keeps only the R1 cause), so a re-read below the R1 row may count it acted: stricter.
 */
export function actAt(u: Unit, t: number): { acted: boolean; correct: boolean; dangerous: boolean } {
  let best: Offer | null = null;
  for (const offer of u.offers) if (offer.score >= t && (best === null || offer.prio > best.prio)) best = offer;
  return judge(u, best?.pick ?? null);
}

/** The unit as read at `t`, or unchanged when `t` is undefined (R1). */
export function readAt(u: Unit, t?: number): Unit {
  return t === undefined ? u : { ...u, ...actAt(u, t) };
}

/** 5.1 quantities of a cell. */
export interface Summary {
  items: number; acted: number; actedGroups: number; right: number; wrong: number;
  answerable: number; coverage: number; actRate: number; precision: number; wrongRate: number;
  dangerEligible: number; dangerous: number; dangerRate: number; failures: number;
}

export function summarize(units: readonly Unit[]): Summary {
  const acted = units.filter((u) => u.acted);
  const right = acted.filter((u) => u.correct).length;
  const answerable = units.filter((u) => u.answerable);
  const eligible = units.filter((u) => u.dangerEligible);
  const dangerous = eligible.filter((u) => u.dangerous).length;
  const div = (a: number, b: number) => (b === 0 ? Number.NaN : a / b);
  return {
    items: units.length, acted: acted.length, actedGroups: new Set(acted.map((u) => u.group)).size, right,
    wrong: acted.length - right, answerable: answerable.length,
    coverage: div(answerable.filter((u) => u.acted && u.correct).length, answerable.length),
    actRate: div(acted.length, units.length), precision: div(right, acted.length), wrongRate: div(acted.length - right, units.length),
    dangerEligible: eligible.length, dangerous, dangerRate: div(dangerous, eligible.length),
    failures: units.filter((u) => u.failure).length,
  };
}

/** Coverage (5.1) of a unit list; NaN with no answerable item. */
export function coverageOf(units: readonly Unit[]): number {
  let n = 0;
  let k = 0;
  for (const u of units) if (u.answerable) { n += 1; if (u.acted && u.correct) k += 1; }
  return n === 0 ? Number.NaN : k / n;
}

/** Wrong-act rate (5.1): wrong acts / items. */
export function wrongRateOf(units: readonly Unit[]): number {
  return units.length === 0 ? Number.NaN : units.filter((u) => u.acted && !u.correct).length / units.length;
}

function groupsOf<T>(rows: readonly T[], groupOf: (row: T) => string, value: (row: T) => number): number[][] {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const key = groupOf(row);
    const list = map.get(key);
    if (list) list.push(value(row));
    else map.set(key, [value(row)]);
  }
  return [...map.keys()].sort().map((key) => map.get(key)!);
}

/** A deff-adjusted Clopper-Pearson reading (3.1) with its item-level and cluster-bootstrap sensitivity bounds. */
export interface Bound {
  verdict: string; pStar: number; alpha: number; floor: number;
  n: number; x: number; groups: number; rho: number; deff: number; nEff: number; xEff: number;
  lower: number; upper: number; itemLower: number; itemUpper: number; bootLower: number; bootUpper: number;
}

/** The 3.1 rho of an indicator over units: the cell's ICC with >= 3 events, else the site pool's, else 0.1. */
function rhoFor<T>(cell: readonly T[], pool: readonly T[] | undefined, group: (u: T) => string, hit: (u: T) => boolean): number {
  const g = (rows: readonly T[]) => ({ events: rows.filter(hit).length, groups: groupsOf(rows, group, (u) => (hit(u) ? 1 : 0)) });
  return pickRho(g(cell), pool ? g(pool) : undefined);
}

/**
 * 3.1 precision rule: one-sided deff-adjusted CP of precision at `alpha` (0.05, or 0.05/k for a non-incumbent's
 * pass, 5.4); `pass` lower >= P*, `fail` upper < P*, else `inconclusive`; `inconclusive (n)` below `floor` on n_eff.
 * `pool` = every arm and set of the site (the rho fallback).
 */
export function precisionRule(units: readonly Unit[], pStar: number, floor: number,
  opts: { alpha?: number; pool?: readonly Unit[]; resamples?: number } = {}): Bound {
  const alpha = opts.alpha ?? 0.05;
  const acted = units.filter((u) => u.acted);
  const wrong = acted.filter((u) => !u.correct).length;
  const groups = new Set(acted.map((u) => u.group)).size;
  const rho = rhoFor(acted, opts.pool?.filter((u) => u.acted), (u) => u.group, (u) => !u.correct);
  const k = kish(acted.length, wrong, groups, rho);
  const cp = clopperPearson(k.xEff, k.nEff, alpha);
  const item = clopperPearson(wrong, acted.length, alpha);
  const draws = bootstrapDraws(acted, (u) => u.group, (rows) => (rows.length === 0 ? Number.NaN : rows.filter((u) => u.correct).length / rows.length),
    { resamples: opts.resamples ?? 2000 });
  const lower = 1 - cp.upper;
  const upper = 1 - cp.lower;
  const verdict = k.nEff < floor ? 'inconclusive (n)' : lower >= pStar ? 'pass' : upper < pStar ? 'fail' : 'inconclusive';
  return {
    verdict, pStar, alpha, floor, n: acted.length, x: wrong, groups, rho, deff: k.deff, nEff: k.nEff, xEff: k.xEff,
    lower, upper, itemLower: 1 - item.upper, itemUpper: 1 - item.lower, bootLower: drawAt(draws, alpha), bootUpper: drawAt(draws, 1 - alpha),
  };
}

/** 3.1 danger reading: deff-adjusted one-sided 95% upper bound of the dangerous rate; safe below 1% with D299 met. */
export interface Danger {
  verdict: 'safe' | 'unsafe' | 'below D299'; n: number; x: number; groups: number; rho: number; deff: number;
  nEff: number; xEff: number; upper: number; exactUpper: number; perWait: number | null;
}

export function dangerRule(units: readonly Unit[], pool?: readonly Unit[]): Danger {
  const eligible = units.filter((u) => u.dangerEligible);
  const x = eligible.filter((u) => u.dangerous).length;
  const groups = new Set(eligible.map((u) => u.group)).size;
  const rho = rhoFor(eligible, pool?.filter((u) => u.dangerEligible), (u) => u.group, (u) => u.dangerous);
  const k = kish(eligible.length, x, groups, rho);
  const upper = clopperPearson(k.xEff, k.nEff).upper;
  const exactUpper = clopperPearson(x, eligible.length).upper;
  const site = units[0]?.site;
  return {
    verdict: k.nEff < D299 ? 'below D299' : upper < 0.01 ? 'safe' : 'unsafe', n: eligible.length, x, groups, rho,
    deff: k.deff, nEff: k.nEff, xEff: k.xEff, upper, exactUpper,
    // 5.1: wait-for asks up to 10 times by default, so a presence cell also prints 1 - (1 - u)^10.
    perWait: site === 'presence' ? 1 - (1 - upper) ** 10 : null,
  };
}

/** `miss_write` (Terms, 5.1): abstains on gold-true outcome write items, with its exact two-sided 95% CP interval. */
export function missWrite(units: readonly Unit[]): { n: number; x: number; rate: number; lower: number; upper: number } {
  const pool = units.filter((u) => u.site === 'outcome' && u.answerable && (u.risk === 'write' || u.risk === null));
  const x = pool.filter((u) => !u.acted).length;
  const cp = clopperPearson(x, pool.length, 0.025);
  return { n: pool.length, x, rate: pool.length === 0 ? Number.NaN : x / pool.length, lower: cp.lower, upper: cp.upper };
}

/* ---------- R2: matched precision (5.3) ---------- */

export const R2_TARGETS = [0.95, 0.98, 0.99] as const;
const RISK_LEVEL: Readonly<Record<string, number>> = { read: 0, write: 1, consent: 2, auth: 2, money: 2, irreversible: 2, none: 3 };
export const RISK_CLASSES = ['read', 'write', 'consent', 'auth', 'money', 'irreversible', 'none'] as const;

/** The 5.3 risk class of a unit on locate/find: its label, or `none` (no risk). */
export function classOf(u: Pick<Unit, 'risk'>): string {
  return u.risk !== null && u.risk in RISK_LEVEL && u.risk !== 'none' ? u.risk : 'none';
}

/** The starting row a fitted R2 row is floored at (5.3; `fit.ts --floor`). */
export function startRow(site: string, cls = 'none'): number {
  if (site === 'locate' || site === 'find') return cls === 'none' ? 0.85 : LOCATE_ROWS[cls as keyof typeof LOCATE_ROWS] ?? 0.85;
  if (site === 'dismiss') return DISMISS_START;
  if (site === 'presence' || site === 'outcome') return NOUL_BAND.yesAtLeast;
  return CHOICE_START;
}

/**
 * The lowest offered score t at which training precision >= P with >= 30 acted training items; Infinity when no t
 * qualifies (the fold acts on nothing). Incremental over offers sorted by score, highest first, so a part with
 * higher precedence (fallback's first part) replaces a lower one once t falls below its score.
 */
export function fitLowest(train: readonly Unit[], P: number, minActed = 30): number {
  const events: { score: number; u: number; offer: Offer }[] = [];
  train.forEach((u, i) => { for (const offer of u.offers) events.push({ score: offer.score, u: i, offer }); });
  events.sort((a, b) => b.score - a.score);
  const state = new Map<number, { prio: number; correct: boolean }>();
  let acted = 0;
  let right = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    const now = state.get(e.u);
    if (now === undefined || e.offer.prio > now.prio) {
      const correct = judge(train[e.u]!, e.offer.pick).correct;
      if (now === undefined) acted += 1;
      else if (now.correct) right -= 1;
      if (correct) right += 1;
      state.set(e.u, { prio: e.offer.prio, correct });
    }
    const last = i === events.length - 1 || events[i + 1]!.score < e.score;
    if (last && acted >= minActed && right / acted >= P) best = e.score;
  }
  return best;
}

/** Units that could act at some row (they count toward a class's >= 30 acted training items). */
function actable(units: readonly Unit[]): number {
  return units.filter((u) => u.offers.length > 0).length;
}

/**
 * The rows fitted on `train` at target P (5.3): per risk class on locate/find (too few items -> the next stricter
 * class's row; the strictest with too few -> the fit over every class; then row_r = max(fit_r, start_r, every
 * lower class's row)), else one row = max(fit, start). Combos (`shared`) fit one row over the combo's offers.
 */
export function fitRows(train: readonly Unit[], P: number, site: string): Map<string, number> {
  const rows = new Map<string, number>();
  if (site !== 'locate' && site !== 'find') {
    rows.set('all', Math.max(fitLowest(train, P), startRow(site)));
    return rows;
  }
  const raw = new Map<string, number | undefined>();
  for (const cls of RISK_CLASSES) {
    const mine = train.filter((u) => classOf(u) === cls);
    raw.set(cls, actable(mine) >= 30 ? fitLowest(mine, P) : undefined);
  }
  const filled = new Map<string, number>();
  let stricter: number | undefined;
  for (const level of [3, 2, 1, 0]) {
    const here = RISK_CLASSES.filter((cls) => RISK_LEVEL[cls] === level);
    for (const cls of here) filled.set(cls, raw.get(cls) ?? stricter ?? fitLowest(train, P));
    stricter = Math.max(...here.map((cls) => filled.get(cls)!));
  }
  for (const cls of [...RISK_CLASSES].sort((a, b) => RISK_LEVEL[a]! - RISK_LEVEL[b]!)) {
    const lower = [...rows.entries()].filter(([c]) => RISK_LEVEL[c]! < RISK_LEVEL[cls]!).map(([, v]) => v);
    rows.set(cls, Math.max(filled.get(cls)!, startRow(site, cls), ...lower));
  }
  return rows;
}

/** The row a unit is read at under fitted rows. */
export function rowFor(rows: Map<string, number>, u: Unit): number {
  return rows.get('all') ?? rows.get(classOf(u)) ?? Number.POSITIVE_INFINITY;
}

/** 5.3 folds: sha256(`refsure-bench-20261016:` + group) first byte mod 5. */
const FOLDS = new Map<string, number>();

export function r2Fold(u: Pick<Unit, 'group'>): number {
  let f = FOLDS.get(u.group);
  if (f === undefined) FOLDS.set(u.group, (f = foldOf(u.group, 5)));
  return f;
}

/** R2 coverage (5.3) without building the held units: the bootstrap's statistic, refit inside every resample. */
export function r2Coverage(units: readonly Unit[], P: number, site: string): number {
  let n = 0;
  let k = 0;
  for (let f = 0; f < 5; f += 1) {
    const rows = fitRows(units.filter((u) => r2Fold(u) !== f), P, site);
    for (const u of units) {
      if (r2Fold(u) !== f || !u.answerable) continue;
      n += 1;
      const a = actAt(u, rowFor(rows, u));
      if (a.acted && a.correct) k += 1;
    }
  }
  return n === 0 ? Number.NaN : k / n;
}

/** The held-fold re-read of every unit under rows fitted on the other four folds, and the five fold rows. */
export function crossFit(units: readonly Unit[], P: number, site: string): { held: Unit[]; folds: Map<string, number>[] } {
  const held: Unit[] = [];
  const folds: Map<string, number>[] = [];
  for (let f = 0; f < 5; f += 1) {
    const rows = fitRows(units.filter((u) => r2Fold(u) !== f), P, site);
    folds.push(rows);
    for (const u of units) if (r2Fold(u) === f) held.push({ ...u, ...actAt(u, rowFor(rows, u)) });
  }
  return { held, folds };
}

/** One R2 cell (5.3): pooled held coverage and realised precision, the mean fold row per class, `R2 missed P`. */
export interface R2Cell {
  P: number; coverage: number; coverageLower: number; coverageUpper: number; precision: Bound;
  rows: Record<string, number | null>; missed: boolean; infiniteFolds: number;
}

/**
 * R2 at target P. The coverage interval is a 2,000-resample group bootstrap with the whole fold refit inside each
 * resample (T7). `rows` prints the mean of the five fold rows per class (a candidate, never adopted; null when a
 * fold acts on nothing in that class, counted in `infiniteFolds`).
 */
export function r2Cell(units: readonly Unit[], P: number, site: string, opts: { pool?: readonly Unit[]; resamples?: number; floor: number }): R2Cell {
  const { held, folds } = crossFit(units, P, site);
  const precision = precisionRule(held, P, opts.floor, { pool: opts.pool, resamples: opts.resamples });
  const draws = bootstrapDraws(units, (u) => u.group, (rows) => r2Coverage(rows, P, site), { resamples: opts.resamples ?? 2000 });
  const rows: Record<string, number | null> = {};
  let infiniteFolds = 0;
  for (const cls of folds[0]?.keys() ?? []) {
    const values = folds.map((f) => f.get(cls)!);
    const finite = values.filter((v) => Number.isFinite(v));
    infiniteFolds += values.length - finite.length;
    rows[cls] = finite.length === values.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
  }
  return {
    P, coverage: coverageOf(held), coverageLower: drawAt(draws, 0.025), coverageUpper: drawAt(draws, 0.975), precision, rows,
    missed: precision.lower < P - 0.02, infiniteFolds,
  };
}

/* ---------- Paired comparisons (5.4) ---------- */

export interface Pair { key: string; group: string; a: Unit; b: Unit }

/** Units of two cells on the same items (by `<set>:<item>`), sorted by key. */
export function pairUnits(a: readonly Unit[], b: readonly Unit[]): Pair[] {
  const byKey = new Map(b.map((u) => [u.key, u]));
  return a.filter((u) => byKey.has(u.key)).map((u) => ({ key: u.key, group: u.group, a: u, b: byKey.get(u.key)! }))
    .sort((x, y) => x.key.localeCompare(y.key));
}

export interface PairedDiff { estimate: number; lower: number; upper: number; p: number; n: number }

/** Paired group-bootstrap 95% CI of statB(B) - stat(A) on the same resamples, with a two-sided bootstrap p. */
export function pairedDiff(pairs: readonly Pair[], stat: (units: readonly Unit[]) => number, resamples = 2000,
  statB: (units: readonly Unit[]) => number = stat): PairedDiff {
  const diff = (rows: readonly Pair[]) => statB(rows.map((p) => p.b)) - stat(rows.map((p) => p.a));
  const draws = bootstrapDraws(pairs, (p) => p.group, diff, { resamples });
  const below = draws.filter((v) => v <= 0).length / Math.max(1, draws.length);
  const above = draws.filter((v) => v >= 0).length / Math.max(1, draws.length);
  return { estimate: diff(pairs), lower: drawAt(draws, 0.025), upper: drawAt(draws, 0.975), p: Math.min(1, 2 * Math.min(below, above)), n: pairs.length };
}

/** Exact McNemar on item-level discordant pairs of an indicator: b = A only, c = B only; two- and one-sided p. */
export function mcnemarPairs(pairs: readonly Pair[], hit: (u: Unit) => boolean): { b: number; c: number; p: number; pBFewer: number } {
  let b = 0;
  let c = 0;
  for (const p of pairs) {
    const x = hit(p.a);
    const y = hit(p.b);
    if (x && !y) b += 1;
    if (!x && y) c += 1;
  }
  // One-sided: B has fewer hits than A (P(X >= b) under Bin(b + c, 1/2)).
  return { b, c, p: mcnemarExact(b, c), pBFewer: b === 0 ? 1 : 1 - binomCdf(b - 1, b + c, 0.5) };
}

/* ---------- Timing (4.4) ---------- */

/** One P6 row as 4.4 reads it. M1 = a quality row (`T_ask` of its one attempt); M2 = a Decision row (`T_decision`). */
export interface TimingRow {
  mode: 'M1' | 'M2'; arm: string; site: string; set: string; item: string; group: string; repeat: string;
  /** Measured ms; a row without an answer ranks +inf (`answered` false). */
  t: number; answered: boolean; failure: boolean; timedOut: boolean; cacheHit: boolean; cachedTokens: boolean | null;
  flags: string[]; loadavg: number; parts: { t: number | null; timedOut: boolean }[]; tWire: number[];
  /** M2: the row's index within its repeat (A1: T_decision is printed against it); null for M1. */
  rowIndex: number | null;
}

interface WireBits { headers?: Record<string, string>[]; usage?: unknown[] }

function cacheBits(bits: readonly WireBits[]): { hit: boolean; cached: boolean | null } {
  let hit = false;
  let cached: boolean | null = null;
  for (const b of bits) {
    for (const h of b.headers ?? []) for (const [name, value] of Object.entries(h)) if (/cache/i.test(name) && /\bhit\b/i.test(value)) hit = true;
    for (const u of b.usage ?? []) {
      const d = (u as { prompt_tokens_details?: { cached_tokens?: unknown }; cached_tokens?: unknown } | null);
      const n = d?.prompt_tokens_details?.cached_tokens ?? d?.cached_tokens;
      if (typeof n === 'number') cached = (cached ?? false) || n > 0;
    }
  }
  return { hit, cached };
}

interface M2Like {
  mode?: string; arm: string; site: string; set: string; item: string; group: string; repeat: string; status: string;
  t_decision?: number; timed_out?: boolean; flags?: string[]; loadavg?: number; row_index?: number;
  parts?: { t_part: number | null; timed_out: boolean; headers?: Record<string, string>[]; usage?: unknown[]; t_wire?: number[] }[];
  attempts?: QualityRow['attempts'];
}

/** Reads P6 rows into timing rows; `spend_limit` and egress-refused rows are returned apart (bench defects, 4.3). */
export function timingRows(raw: readonly M2Like[], plan: Plan): { rows: TimingRow[]; defects: number } {
  const rows: TimingRow[] = [];
  let defects = 0;
  for (const r of raw) {
    const base = { arm: r.arm, site: r.site, set: canonSet(r.set, plan), item: r.item, group: storedGroup(r.group, r.set),
      repeat: r.repeat, flags: r.flags ?? [], loadavg: r.loadavg ?? 0, rowIndex: typeof r.row_index === 'number' ? r.row_index : null };
    if (r.mode === 'M2' || r.t_decision !== undefined) {
      if (r.status === 'spend_limit' || r.t_decision === undefined) { defects += 1; continue; }
      const parts = r.parts ?? [];
      const c = cacheBits(parts);
      const failure = r.status === 'failure';
      rows.push({ ...base, mode: 'M2', t: failure ? Number.POSITIVE_INFINITY : r.t_decision, answered: !failure, failure,
        timedOut: r.timed_out === true, cacheHit: c.hit, cachedTokens: c.cached,
        parts: parts.map((p) => ({ t: p.t_part, timedOut: p.timed_out })), tWire: parts.flatMap((p) => p.t_wire ?? []) });
      continue;
    }
    const first = r.attempts?.[0];
    if (!first) { defects += 1; continue; }
    const c = cacheBits([first]);
    const failure = FAILURE.test(first.status);
    rows.push({ ...base, mode: 'M1', t: failure ? Number.POSITIVE_INFINITY : first.t_ask, answered: !failure, failure,
      timedOut: first.timed_out, cacheHit: c.hit, cachedTokens: c.cached, parts: [{ t: first.t_ask, timedOut: first.timed_out }],
      tWire: first.t_wire });
  }
  return { rows, defects };
}

export interface Pct { p50: number; p95: number; n: number }

function pct(rows: readonly TimingRow[]): Pct {
  const t = rows.map((r) => r.t);
  return { p50: nearestRank(t, 0.5), p95: nearestRank(t, 0.95), n: t.length };
}

export const SENSITIVITY_FLAGS = ['high_load', 'slow_gateway', 'slow_window'];

/** One 4.4 timing cell: every row but cache-served ones (excluded and counted). */
export interface TimingCell {
  rows: number; cacheExcluded: number; p50: number; p95: number; p95Ci: { lower: number; upper: number };
  p95Os: { lower: number; upper: number; coverage: number } | null; failShare: number; failures: boolean;
  overBudget: number; overPart: number | null; overDecision10k: number | null;
  byRepeat: { r1: Pct; later: Pct }; byCached: { yes: Pct; no: Pct };
  unflagged: Pct; load: { p50: number; max: number };
}

/**
 * A time as a bootstrap statistic: +inf (a percentile on a row without an answer) becomes Number.MAX_VALUE so the
 * draw is kept (bootstrapDraws drops non-finite values), and `fromDraw` maps it back. MAX_VALUE minus any time
 * stays MAX_VALUE in floating point, so a paired difference with one infinite side reads +-inf too.
 */
export function toDraw(ms: number): number {
  return ms === Number.POSITIVE_INFINITY ? Number.MAX_VALUE : ms;
}

export function fromDraw(v: number): number {
  return v >= Number.MAX_VALUE ? Number.POSITIVE_INFINITY : v <= -Number.MAX_VALUE ? Number.NEGATIVE_INFINITY : v;
}

export function timingCell(all: readonly TimingRow[], opts: { fallback?: boolean; resamples?: number } = {}): TimingCell {
  const rows = all.filter((r) => !r.cacheHit);
  const t = rows.map((r) => r.t).sort((a, b) => a - b);
  const draws = bootstrapDraws(rows, (r) => r.group, (rs) => toDraw(nearestRank(rs.map((r) => r.t), 0.95)), { resamples: opts.resamples ?? 2000 });
  const os = orderStatisticCi(t.length, 0.95, 0.95);
  const over = (r: TimingRow, ms: number) => r.timedOut || r.t > ms;
  const parts = rows.flatMap((r) => r.parts);
  const loads = rows.map((r) => r.loadavg);
  return {
    rows: rows.length, cacheExcluded: all.length - rows.length, p50: nearestRank(t, 0.5), p95: nearestRank(t, 0.95),
    p95Ci: { lower: fromDraw(drawAt(draws, 0.025)), upper: fromDraw(drawAt(draws, 0.975)) },
    p95Os: os === null ? null : { lower: t[os.j - 1]!, upper: t[os.k - 1]!, coverage: os.coverage },
    failShare: rows.length === 0 ? Number.NaN : rows.filter((r) => r.failure).length / rows.length,
    failures: rows.length > 0 && rows.filter((r) => !r.answered).length / rows.length > 0.02,
    overBudget: rows.length === 0 ? Number.NaN : rows.filter((r) => over(r, 5000)).length / rows.length,
    overPart: opts.fallback ? (parts.length === 0 ? Number.NaN : parts.filter((p) => p.timedOut || (p.t ?? 0) > 5000).length / parts.length) : null,
    overDecision10k: opts.fallback ? (rows.length === 0 ? Number.NaN : rows.filter((r) => !r.answered || r.t > 10_000).length / rows.length) : null,
    byRepeat: { r1: pct(rows.filter((r) => r.repeat === 'r1')), later: pct(rows.filter((r) => r.repeat !== 'r1')) },
    byCached: { yes: pct(rows.filter((r) => r.cachedTokens === true)), no: pct(rows.filter((r) => r.cachedTokens !== true)) },
    unflagged: pct(rows.filter((r) => !r.flags.some((f) => SENSITIVITY_FLAGS.includes(f)))),
    load: { p50: nearestRank(loads, 0.5), max: loads.length === 0 ? Number.NaN : Math.max(...loads) },
  };
}

/**
 * 4.4 "A is faster than B": the paired group-bootstrap 95% CI of percentile(A) - percentile(B) on the items both
 * timed (every row of a resampled item kept). A draw where one side lands on +inf is kept as +-inf (toDraw); both
 * sides on +inf read 0 (neither answers). `infDraws` counts the draws with either side on +inf.
 */
export function pairedPercentile(a: readonly TimingRow[], b: readonly TimingRow[], q: number, resamples = 2000):
  PairedDiff & { infDraws: number } {
  const key = (r: TimingRow) => `${r.set}:${r.item}`;
  const bItems = new Map<string, TimingRow[]>();
  for (const r of b.filter((x) => !x.cacheHit)) bItems.set(key(r), [...(bItems.get(key(r)) ?? []), r]);
  const aItems = new Map<string, TimingRow[]>();
  for (const r of a.filter((x) => !x.cacheHit)) if (bItems.has(key(r))) aItems.set(key(r), [...(aItems.get(key(r)) ?? []), r]);
  const recs = [...aItems.keys()].sort().map((k) => ({ group: aItems.get(k)![0]!.group, a: aItems.get(k)!, b: bItems.get(k)! }));
  let infDraws = 0;
  const stat = (rs: readonly typeof recs[number][]) => {
    const pa = nearestRank(rs.flatMap((r) => r.a.map((x) => x.t)), q);
    const pb = nearestRank(rs.flatMap((r) => r.b.map((x) => x.t)), q);
    if (pa === Number.POSITIVE_INFINITY || pb === Number.POSITIVE_INFINITY) infDraws += 1;
    return toDraw(pa) - toDraw(pb);
  };
  const draws = bootstrapDraws(recs, (r) => r.group, stat, { resamples });
  const counted = infDraws;
  const below = draws.filter((v) => v <= 0).length / Math.max(1, draws.length);
  const above = draws.filter((v) => v >= 0).length / Math.max(1, draws.length);
  return { estimate: fromDraw(stat(recs)), lower: fromDraw(drawAt(draws, 0.025)), upper: fromDraw(drawAt(draws, 0.975)),
    p: Math.min(1, 2 * Math.min(below, above)), n: recs.length, infDraws: counted };
}

/** Holm-adjusted p per statement of one table (4.4, 5.4), in input order. */
export { holm } from '../lib/stats';

/** `>5,000 (no answer)` for a percentile that lands on a row without an answer (4.4); ms with no decimals otherwise. */
export function fmtMs(v: number): string {
  if (v === Number.POSITIVE_INFINITY) return '>5,000 (no answer)';
  if (v === Number.NEGATIVE_INFINITY) return '-inf (no answer on the subtracted side)';
  return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : 'n/a';
}

export { BENCH_SEED, anovaIcc };

/* ---------- Combos (2.4) ---------- */

/** One part of a combo row as combos.ts writes it: the stored single-arm row's R1 read and whether the combo asked it. */
export interface ComboPart { arm: string; provider: string; asked: boolean; family_ok: boolean | null; r1: QualityRow['r1'] }

/** One offline combo row as combos.ts writes it (`<results>/<phase>/combos/<shape>/<set>.jsonl`). */
export interface ComboRow {
  combo_key: string; set: string; item: string; group: string; site: string; combo: string; kind: string;
  label: 'createDecide' | 'bench_combinator'; shape_class: 'production' | 'research'; order: string; repeat: string;
  presented: Record<string, number | null> | null; gold: string | null; alt: string[]; risk: string | null; danger_eligible: boolean | null;
  dropped: string | null; parts: ComboPart[]; verdict: QualityRow['r1']; correct: boolean | null; dangerous: boolean | null;
  settle: unknown; usd_priced: number | null; digest?: string | null;
}

/** The arm id a combo reads under: the production shape's kind (`agree`, `fallback`), else `bench:<shape id>`. */
export function comboArm(row: Pick<ComboRow, 'shape_class' | 'kind' | 'combo'>): string {
  return row.shape_class === 'production' ? row.kind : `bench:${row.combo}`;
}

/** A part's lean as an offer: its caller index (or `true`) and the confidence it read at. */
function partOffer(row: ComboRow, part: ComboPart): { pick: string; score: number } | null {
  const r = part.r1;
  if (!r || typeof r.confidence !== 'number' || r.cause === 'twins') return null;
  if (row.site === 'presence' || row.site === 'outcome') return { pick: 'true', score: r.confidence };
  if (r.verdict === 'answer') return { pick: String(r.value), score: r.confidence };
  if (r.index === null) return null;
  const caller = CANDIDATE.has(row.site) ? row.presented?.[r.index] : r.index;
  return caller === undefined || caller === null || caller === 'none' ? null : { pick: String(caller), score: r.confidence };
}

/** What a combo row does not carry and its single-arm unit of the same `<set>:<item>` does (X3, slices, Q11). */
export type ItemFacts = Pick<Unit, 'visualOnly' | 'origin' | 'lang' | 'condition' | 'masks'>;

/**
 * A combo unit row (`p0`/`r1` or `fixed`/`r1`, not dropped) as a unit; offers follow the shape at one shared row
 * (5.3). `like` = the item's facts from a single-arm unit row of the same key; without it the combo row reads as a
 * native text row with masks on (the caller lists such rows).
 */
export function comboUnit(row: ComboRow, plan: Plan, like?: ItemFacts): Unit {
  const asRow = {
    row_key: row.combo_key, arm: comboArm(row), site: row.site, set: row.set, item: row.item, group: row.group, order: row.order,
    repeat: row.repeat, variant: 'shipped', gold: row.gold ?? '', alt: row.alt ?? [], risk: row.risk, r1: row.verdict,
    correct: row.correct, dangerous: row.dangerous, settle: row.settle, status: row.verdict ? 'ok' : 'transport',
    answer: null, presented: row.presented, attempts: [], provider: 'jev', origin: like?.origin ?? 'native', lang: like?.lang ?? '',
    condition: like?.condition ?? '', masks: like?.masks ?? true, visual_only: like?.visualOnly ?? false, family_ok: row.parts.every((p) => p.family_ok !== false), digest: row.digest ?? null, threshold_r1: null,
    danger_eligible: row.danger_eligible ?? dangerOf(row.site, row.gold ?? ''), flags: [],
  } as unknown as QualityRow;
  const u = toUnit(asRow, plan);
  const leans = row.parts.map((p) => partOffer(row, p));
  let offers: Offer[] = [];
  if (row.kind === 'agree' && leans.every((l) => l !== null) && new Set(leans.map((l) => l!.pick)).size === 1) {
    offers = [{ score: Math.min(...leans.map((l) => l!.score)), pick: leans[0]!.pick, prio: 1 }];
  } else if (row.kind === 'fallback') {
    offers = leans.flatMap((l, i) => (l === null ? [] : [{ score: l.score, pick: l.pick, prio: leans.length - i }]));
  }
  const answered = row.verdict?.verdict === 'answer';
  return { ...u, offers: u.site === 'dismiss' && u.vetoed === true ? [] : offers, pick: null, score: null,
    usd1: row.usd_priced, branch: !answered ? null : row.kind === 'fallback' && row.parts[1]?.asked ? 'second' : 'first',
    answered: row.verdict !== null, partArms: row.parts.map((p) => p.arm) };
}

/** Combo unit rows of every phase's `combos/` directory (latest per `combo_key`), dropped pairs counted apart. */
export function comboRows(results: string, phase = 'P4'): { rows: ComboRow[]; dropped: number } {
  const latest = new Map<string, ComboRow>();
  for (const row of plainRows<ComboRow>(join(results, phase, 'combos'))) latest.set(row.combo_key, row);
  const all = [...latest.values()];
  const unit = all.filter((r) => r.repeat === 'r1' && r.order === (CANDIDATE.has(r.site) ? 'p0' : 'fixed'));
  return { rows: unit.filter((r) => r.dropped === null), dropped: unit.filter((r) => r.dropped !== null).length };
}

/** The 2.4 gates per site, recomputed from the P5b live rows as combos.ts's gate summary reads them. */
export interface Gates {
  replay: { ok: boolean; mismatches: number };
  separate: Record<string, { share: number; unexplained: number; compared: number }>;
}

interface LiveRow { site: string; replay_equal: boolean | null; separate_equal: boolean | null; explained: boolean | null }

export function readGates(results: string): Gates | null {
  const rows = plainRows<LiveRow>(join(results, 'P5b', 'live'));
  if (rows.length === 0) return null;
  const mismatches = rows.filter((r) => r.replay_equal !== true).length;
  const separate: Gates['separate'] = {};
  for (const site of [...new Set(rows.map((r) => r.site))].sort()) {
    const compared = rows.filter((r) => r.site === site && r.separate_equal !== null);
    const equal = compared.filter((r) => r.separate_equal === true).length;
    separate[site] = { share: compared.length === 0 ? Number.NaN : equal / compared.length, compared: compared.length,
      unexplained: compared.filter((r) => r.separate_equal === false && r.explained !== true).length };
  }
  return { replay: { ok: mismatches === 0, mismatches }, separate };
}
