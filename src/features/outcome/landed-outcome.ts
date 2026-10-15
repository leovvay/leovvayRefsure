import type { CommandOutcome } from '../../cli';
import type { OutcomeResult } from './outcome.contract';

/**
 * `landed` (exit 0), settled by a code rule (`rule` names it) or by the Decision. `effect` is `dispatched` when
 * refsure dispatched the act itself (`outcome -- <verb>`), `none` under `--mark`, which only reads.
 */
export function landedOutcome(
  effect: 'dispatched' | 'none', by: OutcomeResult['by'], rule?: OutcomeResult['rule'],
): CommandOutcome<OutcomeResult> {
  const result: OutcomeResult = { verdict: 'landed', by };
  if (rule) result.rule = rule;
  const outcome: CommandOutcome<OutcomeResult> = { status: 'ok', acted: effect === 'dispatched', effect, result };
  if (by === 'code') outcome.settledByCode = true;
  return outcome;
}
