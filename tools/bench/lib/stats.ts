import { createHash } from 'node:crypto';

/*
  The statistics sections 3-5 name, with no dependency: seeded PRNG, Clopper-Pearson, the Kish design effect with
  the one-way ANOVA ICC, nearest-rank percentiles and order-statistic CIs, the grouped bootstrap, exact McNemar,
  sign and Wilcoxon signed-rank tests with Hodges-Lehmann CIs, Holm, and grouped folds.
*/

export const BENCH_SEED = 'refsure-bench-20261016';

/** 32-bit FNV-1a over UTF-16 units (the same function refsure seeds its shuffle with). */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: a seeded generator of [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** mulberry32 seeded by FNV-1a of `seed` (2.3, 4.3: `refsure-bench-20261016:<...>`). */
export function seeded(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}

/** Fisher-Yates in place under `random`; returns the array. */
export function shuffleInPlace<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** 3.1/2.5 folds: sha256(`<prefix>` + group) first byte mod `k`. The 2.5 dev half is fold < 5 of k = 10. */
export function foldOf(group: string, k = 10, prefix = `${BENCH_SEED}:`): number {
  return createHash('sha256').update(prefix + group).digest()[0]! % k;
}

function lgamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = c[0]!;
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function logChoose(n: number, k: number): number {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/** P(X <= x) for X ~ Bin(n, p). */
export function binomCdf(x: number, n: number, p: number): number {
  if (x < 0) return 0;
  if (x >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let sum = 0;
  for (let k = 0; k <= x; k += 1) sum += Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  return Math.min(1, sum);
}

function bisect(f: (p: number) => number, target: number, increasing: boolean): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < target) === increasing) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Clopper-Pearson bounds for x successes of n, each one-sided at level `alpha` (default 0.05: the one-sided 95%
 * bound 3.1 uses). Pass alpha/2 for a two-sided interval.
 */
export function clopperPearson(x: number, n: number, alpha = 0.05): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const lower = x === 0 ? 0 : bisect((p) => 1 - binomCdf(x - 1, n, p), alpha, true);
  const upper = x === n ? 1 : bisect((p) => binomCdf(x, n, p), alpha, false);
  return { lower, upper };
}

/** One-way ANOVA intra-class correlation of a 0/1 (or any numeric) indicator over groups; NaN when undefined. */
export function anovaIcc(groups: readonly (readonly number[])[]): number {
  const used = groups.filter((g) => g.length > 0);
  const k = used.length;
  const n = used.reduce((sum, g) => sum + g.length, 0);
  if (k < 2 || n <= k) return Number.NaN;
  const mean = used.reduce((sum, g) => sum + g.reduce((a, b) => a + b, 0), 0) / n;
  let ssb = 0;
  let ssw = 0;
  for (const g of used) {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    ssb += g.length * (m - mean) ** 2;
    for (const v of g) ssw += (v - m) ** 2;
  }
  const msb = ssb / (k - 1);
  const msw = ssw / (n - k);
  const n0 = (n - used.reduce((sum, g) => sum + g.length ** 2, 0) / n) / (k - 1);
  const denom = msb + (n0 - 1) * msw;
  return denom === 0 ? 0 : (msb - msw) / denom;
}

/** 3.1: rho from the cell if it has >= 3 events, else the site pool if that has >= 3, else 0.1. */
export function pickRho(cell: { events: number; groups: readonly (readonly number[])[] }, pool?: { events: number; groups: readonly (readonly number[])[] }): number {
  const usable = (r: number) => (Number.isFinite(r) ? r : 0.1);
  if (cell.events >= 3) return usable(anovaIcc(cell.groups));
  if (pool && pool.events >= 3) return usable(anovaIcc(pool.groups));
  return 0.1;
}

/**
 * Kish: deff = max(1, 1 + (m - 1) rho), m = mean units per group; n_eff = floor(n / deff), x_eff = ceil(x / deff).
 * With g groups and deff > 1, v / deff is computed as v g / (g + (n - g) rho), the same quotient in a form that is
 * exact at rho = 1 (n_eff = g): there n / deff in doubles can land just below the integer (176.99999999999997 for
 * 209 acted in 177 groups), and the floor would drop a unit the protocol's real quotient keeps (3.1).
 */
export function kish(n: number, x: number, groupCount: number, rho: number): { deff: number; m: number; nEff: number; xEff: number } {
  const m = groupCount > 0 ? n / groupCount : 1;
  const deff = Math.max(1, 1 + (m - 1) * rho);
  const over = (v: number) => (groupCount > 0 && deff > 1 ? (v * groupCount) / (groupCount + (n - groupCount) * rho) : v / deff);
  return { deff, m, nEff: Math.floor(over(n)), xEff: Math.ceil(over(x)) };
}

export type Verdict3 = 'pass' | 'fail' | 'inconclusive';

/**
 * 3.1 precision rule on the one-sided 95% deff-adjusted CP interval: `acted` items, `wrong` wrong acts.
 * pass if lower >= pStar, fail if upper < pStar, else inconclusive; `inconclusive (n)` below the floor.
 */
export function precisionVerdict(acted: number, wrong: number, groupCount: number, rho: number, pStar: number, floor: number):
  { verdict: Verdict3 | 'inconclusive (n)'; lower: number; upper: number; deff: number; nEff: number; xEff: number } {
  const k = kish(acted, wrong, groupCount, rho);
  const wrongRate = clopperPearson(k.xEff, k.nEff);
  const lower = 1 - wrongRate.upper;
  const upper = 1 - wrongRate.lower;
  const base = { lower, upper, deff: k.deff, nEff: k.nEff, xEff: k.xEff };
  if (k.nEff < floor) return { verdict: 'inconclusive (n)', ...base };
  return { verdict: lower >= pStar ? 'pass' : upper < pStar ? 'fail' : 'inconclusive', ...base };
}

/** Evaluability floors (3.1). */
export const E99 = 299;
export const E95 = 59;
export const D299 = 299;

/** Nearest-rank percentile (q in (0, 1]); `Infinity` entries rank last (4.4: a row without an answer). */
export function nearestRank(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

/**
 * 4.4 distribution-free CI for the q-quantile: 1-based ranks j < k with P(j <= Bin(n, q) < k) >= conf, nearest
 * to symmetric about n q.
 */
export function orderStatisticCi(n: number, q = 0.95, conf = 0.95): { j: number; k: number; coverage: number } | null {
  let best: { j: number; k: number; coverage: number } | null = null;
  const centre = n * q;
  const cdf = Array.from({ length: n + 1 }, (_, x) => binomCdf(x, n, q));
  const at = (x: number) => (x < 0 ? 0 : cdf[x]!);
  for (let j = 1; j < n; j += 1) {
    for (let k = j + 1; k <= n; k += 1) {
      const coverage = at(k - 1) - at(j - 1);
      if (coverage >= conf) {
        const asym = Math.abs((centre - j) - (k - centre));
        if (best === null || k - j < best.k - best.j || (k - j === best.k - best.j && asym < Math.abs((centre - best.j) - (best.k - centre)))) {
          best = { j, k, coverage };
        }
        break;
      }
    }
  }
  return best;
}

/**
 * The grouped (cluster) bootstrap's draws: resamples whole groups (sorted by key) with replacement `resamples`
 * times under the seeded PRNG and returns every finite value of `stat` on the resampled rows, sorted ascending.
 */
export function bootstrapDraws<T>(
  rows: readonly T[], groupOf: (row: T) => string, stat: (rows: readonly T[]) => number,
  opts: { resamples?: number; seed?: string } = {},
): number[] {
  const { resamples = 2000, seed = BENCH_SEED } = opts;
  const byGroup = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupOf(row);
    const list = byGroup.get(key);
    if (list) list.push(row);
    else byGroup.set(key, [row]);
  }
  const groups = [...byGroup.keys()].sort().map((key) => byGroup.get(key)!);
  const random = seeded(seed);
  const values: number[] = [];
  for (let b = 0; b < resamples; b += 1) {
    const sample: T[] = [];
    for (let g = 0; g < groups.length; g += 1) sample.push(...groups[Math.floor(random() * groups.length)]!);
    const value = stat(sample);
    if (Number.isFinite(value)) values.push(value);
  }
  return values.sort((a, b) => a - b);
}

/** The [q] percentile of sorted bootstrap draws (NaN when there are none). */
export function drawAt(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] ?? Number.NaN;
}

/**
 * Grouped (cluster) bootstrap, percentile: resamples whole groups with replacement `resamples` times under the
 * seeded PRNG and returns the statistic's [alpha/2, 1 - alpha/2] percentiles. `stat` receives the resampled rows.
 */
export function groupBootstrap<T>(
  rows: readonly T[], groupOf: (row: T) => string, stat: (rows: readonly T[]) => number,
  opts: { resamples?: number; seed?: string; alpha?: number } = {},
): { estimate: number; lower: number; upper: number } {
  const values = bootstrapDraws(rows, groupOf, stat, opts);
  const alpha = opts.alpha ?? 0.05;
  return { estimate: stat(rows), lower: drawAt(values, alpha / 2), upper: drawAt(values, 1 - alpha / 2) };
}

/** Two-sided exact binomial test of k successes in n at 1/2 (the sign test and exact McNemar core). */
function exactHalf(k: number, n: number): number {
  if (n === 0) return 1;
  const tail = binomCdf(Math.min(k, n - k), n, 0.5);
  return Math.min(1, 2 * tail);
}

/** Exact McNemar on the discordant counts b (A right, B wrong) and c (A wrong, B right): two-sided p. */
export function mcnemarExact(b: number, c: number): number {
  return exactHalf(b, b + c);
}

/** Exact sign test: two-sided p from the counts of positive and negative differences (zeros dropped). */
export function signTest(positive: number, negative: number): number {
  return exactHalf(positive, positive + negative);
}

/** Holm step-down adjustment; returns adjusted p-values in the input order. */
export function holm(pvalues: readonly number[]): number[] {
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const out = new Array<number>(pvalues.length);
  let running = 0;
  order.forEach(({ p, i }, rank) => {
    running = Math.max(running, Math.min(1, (pvalues.length - rank) * p));
    out[i] = running;
  });
  return out;
}

/** Midranks of |d| for the nonzero differences, doubled so ties stay integers. */
function doubledRanks(diffs: readonly number[]): { d: number[]; r2: number[] } {
  const d = diffs.filter((x) => x !== 0);
  const idx = d.map((x, i) => ({ a: Math.abs(x), i })).sort((p, q) => p.a - q.a);
  const r2 = new Array<number>(d.length);
  for (let s = 0; s < idx.length;) {
    let e = s;
    while (e + 1 < idx.length && idx[e + 1]!.a === idx[s]!.a) e += 1;
    for (let t = s; t <= e; t += 1) r2[idx[t]!.i] = s + e + 2; // 2 x midrank of 1-based ranks s+1..e+1
    s = e + 1;
  }
  return { d, r2 };
}

/**
 * Wilcoxon signed-rank test (zeros dropped, ties by midranks): two-sided p for W+. Exact null by enumeration over
 * doubled ranks up to `exactMax` nonzero pairs (default 400: a P6 cell holds 100 items), normal with the tie
 * correction above it (`exact` says which).
 */
export function wilcoxonSignedRank(diffs: readonly number[], exactMax = 400): { wPlus: number; n: number; p: number; exact: boolean } {
  const { d, r2 } = doubledRanks(diffs);
  const n = d.length;
  if (n === 0) return { wPlus: 0, n: 0, p: 1, exact: true };
  if (n > exactMax) {
    const wPlus = d.reduce((sum, x, i) => sum + (x > 0 ? r2[i]! / 2 : 0), 0);
    const mean = (n * (n + 1)) / 4;
    const variance = r2.reduce((sum, r) => sum + (r / 2) ** 2, 0) / 4;
    const z = (Math.abs(wPlus - mean) - 0.5) / Math.sqrt(variance);
    return { wPlus, n, p: Math.min(1, 2 * (1 - normalCdf(z))), exact: false };
  }
  const total = r2.reduce((a, b) => a + b, 0);
  let dist = new Float64Array(total + 1);
  dist[0] = 1;
  for (const r of r2) {
    const next = new Float64Array(total + 1);
    for (let s = 0; s <= total; s += 1) {
      const w = dist[s]!;
      if (w === 0) continue;
      next[s] = next[s]! + w * 0.5;
      if (s + r <= total) next[s + r] = next[s + r]! + w * 0.5;
    }
    dist = next;
  }
  const w2 = d.reduce((sum, x, i) => sum + (x > 0 ? r2[i]! : 0), 0);
  const mirror = total - w2;
  const lo = Math.min(w2, mirror);
  let tail = 0;
  for (let s = 0; s <= lo; s += 1) tail += dist[s]!;
  return { wPlus: w2 / 2, n, p: Math.min(1, 2 * tail), exact: true };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Null distribution counts of the signed-rank statistic for ranks 1..n (no ties): P(T <= t) for every t. */
function signedRankCdf(n: number): Float64Array {
  const total = (n * (n + 1)) / 2;
  let dist = new Float64Array(total + 1);
  dist[0] = 1;
  for (let r = 1; r <= n; r += 1) {
    const next = new Float64Array(total + 1);
    for (let s = 0; s <= total; s += 1) {
      const w = dist[s]!;
      if (w === 0) continue;
      next[s] = next[s]! + w * 0.5;
      if (s + r <= total) next[s + r] = next[s + r]! + w * 0.5;
    }
    dist = next;
  }
  for (let s = 1; s <= total; s += 1) dist[s] = dist[s]! + dist[s - 1]!;
  return dist;
}

/**
 * Hodges-Lehmann estimate (median of the Walsh averages) of paired differences, with its CI at `conf` from the
 * signed-rank critical value (exact up to `exactMax` pairs, normal above). Zeros are kept, as the estimator does.
 */
export function hodgesLehmann(diffs: readonly number[], conf = 0.95, exactMax = 400): { estimate: number; lower: number; upper: number } {
  const n = diffs.length;
  if (n === 0) return { estimate: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  const walsh: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = i; j < n; j += 1) walsh.push((diffs[i]! + diffs[j]!) / 2);
  walsh.sort((a, b) => a - b);
  const m = walsh.length;
  const estimate = m % 2 === 1 ? walsh[(m - 1) / 2]! : (walsh[m / 2 - 1]! + walsh[m / 2]!) / 2;
  const alpha = 1 - conf;
  let c: number;
  if (n <= exactMax) {
    const cdf = signedRankCdf(n);
    c = -1;
    while (c + 1 < cdf.length && cdf[c + 1]! <= alpha / 2) c += 1;
  } else {
    const mean = (n * (n + 1)) / 4;
    const sd = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
    c = Math.floor(mean - 1.959963984540054 * sd);
  }
  // c = the largest t with P(T <= t) <= alpha/2; k = c + 1: the CI is the k-th smallest to the k-th largest Walsh average.
  const lower = walsh[Math.max(0, c)]!;
  const upper = walsh[Math.min(m - 1, m - c - 1)]!;
  return { estimate, lower, upper };
}
