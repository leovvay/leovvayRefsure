import type { Threshold } from '../site-policy';
import { noulVerdict } from '../validate-answers';
import type { Ranking, Verdict } from '../verdict';
import type { DecisionAnswer, NoulBand } from '../wire-types';

/*
  How a site reads its one answer into a Verdict. Abstain order (spec §8.2):
  confidence below the threshold first, then `none`. A Noul answers only on
  `yes`; a `no` abstains like an in-band answer, so no verdict ever says
  "failed" or "absent".
*/

/** A choice site's number; a band handed to one reads at its strict edge. */
export function choiceThreshold(threshold: Threshold): number {
  return typeof threshold === 'number' ? threshold : threshold.yesAtLeast;
}

/** A Noul site's band; a bare number is read as a symmetric band. */
export function noulBand(threshold: Threshold): NoulBand {
  return typeof threshold === 'number' ? { yesAtLeast: threshold, noAtMost: 1 - threshold } : threshold;
}

function wrongKind<Out>(expected: 'choice' | 'noul', threshold: number): Verdict<Out> {
  return {
    kind: 'abstain',
    cause: 'provider_error',
    detail: `expected a ${expected} answer`,
    leaned: null,
    confidence: null,
    threshold,
  };
}

/** The offered options by probability, best first; `none` and keys never offered are left out. */
function rankingOf<Out>(probabilities: Readonly<Record<string, number>>, valueOf: (key: string) => Out | null): Ranking<Out> {
  const out: { value: Out; p: number }[] = [];
  for (const [key, p] of Object.entries(probabilities)) {
    const value = valueOf(key);
    if (value !== null && typeof p === 'number' && Number.isFinite(p)) out.push({ value, p });
  }
  return out.sort((a, b) => b.p - a.p);
}

/**
 * `valueOf` maps a criteria key to the site's output, or `null` for a key that was never offered. `noneKey` is the
 * reserved "nothing fits" key, or `null` for a site that offers none (page state).
 */
export function readChoice<Out>(
  answer: DecisionAnswer,
  threshold: Threshold,
  valueOf: (key: string) => Out | null,
  noneKey: string | null,
): Verdict<Out> {
  const min = choiceThreshold(threshold);
  if (answer.type !== 'choice') return wrongKind('choice', min);
  const { choice, confidence } = answer;
  const ranking = rankingOf(answer.probabilities, valueOf);
  if (confidence < min) {
    return {
      kind: 'abstain',
      cause: 'low_confidence',
      detail: `leaned to ${choice} at ${confidence}, below the threshold ${min}`,
      leaned: choice,
      confidence,
      threshold: min,
      ranking,
    };
  }
  if (noneKey !== null && choice === noneKey) {
    return {
      kind: 'abstain',
      cause: 'none_chosen',
      detail: `answered ${noneKey} at ${confidence}: no option fits`,
      leaned: noneKey,
      confidence,
      threshold: min,
      ranking,
    };
  }
  const value = valueOf(choice);
  if (value === null) {
    return {
      kind: 'abstain',
      cause: 'provider_error',
      detail: `answered ${JSON.stringify(choice)}, which was not offered`,
      leaned: null,
      confidence,
      threshold: min,
    };
  }
  return { kind: 'answer', value, index: choice, confidence, threshold: min, ranking };
}

/** `yes` is the site's one answer (`landed`, `present`). */
export function readNoul<Out extends string>(answer: DecisionAnswer, threshold: Threshold, yes: Out): Verdict<Out> {
  const band = noulBand(threshold);
  if (answer.type !== 'noul') return wrongKind('noul', band.yesAtLeast);
  const { noul } = answer;
  if (noulVerdict(noul, band) === 'yes') {
    return { kind: 'answer', value: yes, index: null, confidence: noul, threshold: band.yesAtLeast };
  }
  return {
    kind: 'abstain',
    cause: 'low_confidence',
    detail: `noul ${noul} is under the ${yes} edge ${band.yesAtLeast}`,
    leaned: null,
    confidence: noul,
    threshold: band.yesAtLeast,
  };
}
