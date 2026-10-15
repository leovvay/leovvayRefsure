import type { CommandOutcome } from '../../cli';
import { causeStatus, NEEDS_HUMAN, RE_OBSERVE } from '../../output';
import type { AbstainWhy } from './abstain-why';

/**
 * A Decision that gave no answer, before anything was done (spec §6.1, §8.1 rule 3): the status comes from the
 * cause's one row in the cause table; `abstained` points at a fresh look, `not_set_up` at a human. A route refusal
 * passes its own cause and detail; a whole abstain verdict passes as it is.
 */
export function abstainOutcome<Result>(why: AbstainWhy, result: Result | null): CommandOutcome<Result> {
  const status = causeStatus(why.cause);
  const outcome: CommandOutcome<Result> = {
    status,
    acted: false,
    effect: 'none',
    result,
    why: { cause: why.cause, detail: why.detail },
  };
  if (status === 'abstained') outcome.next = RE_OBSERVE;
  else if (status === 'not_set_up') outcome.next = NEEDS_HUMAN;
  return outcome;
}

/** A Decision that answered an option it was never offered: a provider error, read as no answer. */
export function notOffered(index: string | null): AbstainWhy {
  return { cause: 'provider_error', detail: `answered option ${index ?? '?'}, which was not offered` };
}
