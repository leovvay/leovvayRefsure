import type { CommandOutcome } from '../../cli';
import { causeStatus, type Next } from '../../output';
import type { Verdict } from '../../questions';

type Abstain = Extract<Verdict<unknown>, { kind: 'abstain' }>;

const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
const HUMAN: Next = { do: 'needs_human' };

/**
 * A Decision that gave no answer, before anything was done (spec §6.1, §8.1 rule 3): the status comes from the
 * cause's one row in the cause table; `abstained` points at a fresh look, `not_set_up` at a human.
 */
export function abstainOutcome<Result>(verdict: Abstain, result: Result | null): CommandOutcome<Result> {
  const status = causeStatus(verdict.cause);
  const outcome: CommandOutcome<Result> = {
    status,
    acted: false,
    effect: 'none',
    result,
    why: { cause: verdict.cause, detail: verdict.detail },
  };
  if (status === 'abstained') outcome.next = SNAPSHOT;
  else if (status === 'not_set_up') outcome.next = HUMAN;
  return outcome;
}
