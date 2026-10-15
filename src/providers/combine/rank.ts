import type { AbstainCause } from '../../questions';
import { labelled } from './ask-one';
import type { PartOutcome } from './combo-outcome';
import type { Abstain, Answer } from './verdict-kinds';

/** The spec §8.2 order: a provider that could not answer outranks one that answered without confidence. */
const RANK: Readonly<Partial<Record<AbstainCause, number>>> = {
  provider_timeout: 0,
  provider_error: 1,
  low_confidence: 2,
  none_chosen: 3,
  disagree: 4,
};

/** The first-ranked abstain among the parts, its detail naming its provider; ties go to the earlier part. */
export function firstAbstain<Out>(outcomes: readonly PartOutcome<Out>[]): Abstain<Out> | null {
  let best: { outcome: PartOutcome<Out>; verdict: Abstain<Out>; rank: number } | null = null;
  for (const outcome of outcomes) {
    const verdict = outcome.verdict;
    if (verdict.kind !== 'abstain') continue;
    // A refused key outranks a slow provider: waiting cannot heal it.
    const rank = verdict.permanent ? -1 : RANK[verdict.cause] ?? Number.MAX_SAFE_INTEGER;
    if (best === null || rank < best.rank) best = { outcome, verdict, rank };
  }
  if (best === null) return null;
  return { ...best.verdict, detail: labelled(best.outcome.provider, best.verdict.detail) };
}

/** The answer with the lowest confidence; a part with no confidence is skipped unless all have none. */
export function lowest<Out>(answers: readonly Answer<Out>[]): Answer<Out> | null {
  let low: Answer<Out> | null = null;
  for (const answer of answers) {
    if (low === null || (answer.confidence !== null && (low.confidence === null || answer.confidence < low.confidence))) {
      low = answer;
    }
  }
  return low;
}
