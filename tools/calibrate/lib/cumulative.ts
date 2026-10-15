import type { Point } from './point';
import type { ThresholdFit } from './threshold-fit';

/*
  The plain reading of "the lowest threshold at which precision ≥ target on acted answers": precision over every
  answer at or above the threshold, not at the margin. Kept beside the isotonic fit for comparison (`fit --method
  cumulative`); it ships looser rows, because a band of weaker answers can hide under many strong ones.
*/

function rounded(value: number, below: number, up: boolean): number {
  for (const step of [100, 1_000, 10_000]) {
    const candidate = up ? Math.ceil(value * step - 1e-9) / step : Math.floor(value * step + 1e-9) / step;
    if (up ? candidate < below : candidate > below) return Math.min(1, Math.max(0, candidate));
  }
  return value;
}

/** The lowest observed score whose answers at or above it are right at `target`, with `minItems` of them. */
export function fitUpperCumulative(points: readonly Point[], target: number, minItems: number): ThresholdFit {
  const scores = [...new Set(points.map((point) => point.score))].sort((a, b) => a - b);
  for (const [index, score] of scores.entries()) {
    const above = points.filter((point) => point.score >= score);
    const positives = above.filter((point) => point.positive).length;
    if (above.length >= minItems && positives / above.length >= target) {
      const value = rounded(score, scores[index - 1] ?? Number.NEGATIVE_INFINITY, false);
      return { value, beyond: above.length, precision: positives / above.length, why: 'fitted' };
    }
  }
  return { value: null, beyond: 0, precision: null, why: points.length === 0 ? 'no data' : `no score reaches ${target}` };
}

/** The highest observed score whose answers at or below it are negative at `target`: a Noul's "no" edge. */
export function fitLowerCumulative(points: readonly Point[], target: number, minItems: number): ThresholdFit {
  const scores = [...new Set(points.map((point) => point.score))].sort((a, b) => b - a);
  for (const [index, score] of scores.entries()) {
    const below = points.filter((point) => point.score <= score);
    const negatives = below.filter((point) => !point.positive).length;
    if (below.length >= minItems && negatives / below.length >= target) {
      const value = rounded(score, scores[index - 1] ?? Number.POSITIVE_INFINITY, true);
      return { value, beyond: below.length, precision: negatives / below.length, why: 'fitted' };
    }
  }
  return { value: null, beyond: 0, precision: null, why: points.length === 0 ? 'no data' : `no score falls to ${(1 - target).toFixed(2)}` };
}
