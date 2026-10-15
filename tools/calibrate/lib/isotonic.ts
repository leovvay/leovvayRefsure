import type { Point } from './point';
import type { ThresholdFit } from './threshold-fit';

/*
  The threshold method of the author's earlier decision reports: an increasing isotonic fit (pool-adjacent-
  violators) of "the answer was right" on the model's score, and the smallest score whose calibrated precision
  reaches the target, provided enough points sit at or above it. Equal scores are pooled first, so a boundary
  never falls between two answers the model scored identically. The value is the roundest number that separates
  the same points, never reaching into scores nothing was measured at.
*/

type Block = { lo: number; hi: number; n: number; positives: number; p: number };

export function isotonic(points: readonly Point[]): Block[] {
  const sorted = points.filter((point) => Number.isFinite(point.score)).sort((a, b) => a.score - b.score);
  const blocks: Block[] = [];
  for (const point of sorted) {
    const last = blocks.at(-1);
    const hit = point.positive ? 1 : 0;
    if (last && last.hi === point.score) {
      last.n += 1;
      last.positives += hit;
      last.p = last.positives / last.n;
    } else {
      blocks.push({ lo: point.score, hi: point.score, n: 1, positives: hit, p: hit });
    }
    while (blocks.length > 1 && blocks.at(-2)!.p > blocks.at(-1)!.p) {
      const right = blocks.pop()!;
      const left = blocks.at(-1)!;
      left.hi = right.hi;
      left.n += right.n;
      left.positives += right.positives;
      left.p = left.positives / left.n;
    }
  }
  return blocks;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function roundedAtOrBelow(included: number, excluded: number): number {
  for (const step of [100, 1_000, 10_000]) {
    const candidate = Math.floor(included * step + 1e-9) / step;
    if (candidate > excluded) return clamp01(candidate);
  }
  return clamp01(included);
}

function roundedAtOrAbove(included: number, excluded: number): number {
  for (const step of [100, 1_000, 10_000]) {
    const candidate = Math.ceil(included * step - 1e-9) / step;
    if (candidate < excluded) return clamp01(candidate);
  }
  return clamp01(included);
}

const none = (why: string): ThresholdFit => ({ value: null, beyond: 0, precision: null, why });

/** Smallest score whose calibrated precision is at least `target`, with at least `minItems` points at or above. */
export function fitUpper(points: readonly Point[], target: number, minItems: number): ThresholdFit {
  if (points.length === 0) return none('no data');
  const blocks = isotonic(points);
  const first = blocks.findIndex((block) => block.p >= target);
  if (first < 0) return none(`no score reaches ${target}`);
  const upper = blocks.slice(first);
  const beyond = upper.reduce((sum, block) => sum + block.n, 0);
  if (beyond < minItems) return none(`${beyond} points at ${target} or above, need ${minItems}`);
  const positives = upper.reduce((sum, block) => sum + block.positives, 0);
  const value = roundedAtOrBelow(blocks[first]!.lo, blocks[first - 1]?.hi ?? Number.NEGATIVE_INFINITY);
  return { value, beyond, precision: positives / beyond, why: 'fitted' };
}

/** Largest score whose calibrated P(positive) is at most 1 − `target`: a Noul's "no" edge. */
export function fitLower(points: readonly Point[], target: number, minItems: number): ThresholdFit {
  if (points.length === 0) return none('no data');
  const blocks = isotonic(points);
  let last = -1;
  for (let index = 0; index < blocks.length && blocks[index]!.p <= 1 - target; index += 1) last = index;
  if (last < 0) return none(`no score falls to ${(1 - target).toFixed(2)}`);
  const lower = blocks.slice(0, last + 1);
  const beyond = lower.reduce((sum, block) => sum + block.n, 0);
  if (beyond < minItems) return none(`${beyond} points at ${(1 - target).toFixed(2)} or below, need ${minItems}`);
  const negatives = lower.reduce((sum, block) => sum + block.n - block.positives, 0);
  const value = roundedAtOrAbove(blocks[last]!.hi, blocks[last + 1]?.lo ?? Number.POSITIVE_INFINITY);
  return { value, beyond, precision: negatives / beyond, why: 'fitted' };
}
