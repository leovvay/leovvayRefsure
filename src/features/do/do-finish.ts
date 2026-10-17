import { type CommandOutcome, failureOutcome } from '../../cli';
import { type Next, RE_OBSERVE } from '../../output';
import type { LevelOutcome } from '../dismiss';
import type { WaitForResult } from '../wait-for';
import type { DoResult } from './do.contract';
import type { DoStep } from './do-step';
import type { StepStop } from './step-stop';

type Out = CommandOutcome<DoResult>;

/** After `not_seen`, look at the page as a whole: the steps ran, and what they led to is not what was expected. */
const LOOK_AGAIN: Next = { do: 'state' };

function stepName(step: DoStep, index: number): string {
  return `step ${index + 1} (${step.action} ${JSON.stringify(step.target)})`;
}

/**
 * Something acted, and the run ends short of `seen` or `done`: only exit 30 is honest (spec §6.1), with the reason in
 * `result.unconfirmed` and the detail in `why`.
 */
function unconfirmed(result: DoResult, cause: string, detail: string, next: Next, effect: 'dispatched' | 'unknown' = 'dispatched'): Out {
  return {
    status: 'effect_unknown', acted: true, effect, result: { ...result, unconfirmed: cause },
    why: { cause: 'effect_unknown', detail: `dispatched; not confirmed (${cause}): ${detail}` }, next,
  };
}

/** The blocker level's click may have landed and the overlay is still there: stop, and return it as it is. */
export function blockerUnknown(level: LevelOutcome, result: DoResult): Out {
  const unconfirmedBy = level.why?.cause ?? 'effect_unknown';
  const out: Out = {
    status: 'effect_unknown', acted: true, effect: level.effect ?? 'dispatched',
    result: { ...result, verdict: 'stopped', unconfirmed: unconfirmedBy },
  };
  if (level.why) out.why = level.why;
  out.next = level.next ?? RE_OBSERVE;
  return out;
}

/**
 * A step stopped `do`. Before any act, the envelope is that step's own: its status, cause and `next`, the detail
 * naming the step. After an act (an earlier step's, the blocker click, or this step's own sent act) it is
 * `effect_unknown`, the step's cause in `result.unconfirmed`, and the step's `next` when it gave one.
 */
export function stepStopped(stop: StepStop, steps: readonly DoStep[], acted: boolean, result: DoResult): Out {
  const { outcome } = stop;
  const name = stepName(steps[stop.index]!, stop.index);
  const cause = outcome.why?.cause ?? outcome.status;
  const detail = `${name}: ${outcome.why?.detail ?? outcome.status}`;
  const stopped: DoResult = { ...result, verdict: 'stopped' };
  if (acted || outcome.acted) {
    const effect = outcome.effect === 'unknown' ? 'unknown' : 'dispatched';
    if (cause === 'effect_unknown') {
      const sent: DoResult = { ...stopped, unconfirmed: cause };
      return { status: 'effect_unknown', acted: true, effect, result: sent, why: { cause, detail }, next: outcome.next ?? RE_OBSERVE };
    }
    return unconfirmed(stopped, cause, `the run stopped at ${detail}`, outcome.next ?? RE_OBSERVE, effect);
  }
  const out: Out = { status: outcome.status, acted: false, effect: 'none', result: stopped, why: { cause, detail } };
  if (outcome.next) out.next = outcome.next;
  return out;
}

/**
 * A browser call failed after something acted (the click closed the tab, Orca restarted): exit 30 as the registry
 * would give, but with the steps that ran, what the blocker level did and the new text kept, and the browser's cause
 * in `result.unconfirmed`.
 */
export function failedAfterAct(error: unknown, result: DoResult): Out {
  const { why } = failureOutcome(error, false);
  const cause = why?.cause ?? 'browser_error';
  return unconfirmed({ ...result, verdict: 'stopped' }, cause, why?.detail ?? cause, RE_OBSERVE);
}

/**
 * The wait's end as `do`'s: `seen` is ok; `not_seen` and `stalled` keep their cause, and after an act are exit 30
 * with it in `result.unconfirmed`. A Decision that could not be asked is its own status before any act, and exit 30
 * after one, with `result.verdict` `not_seen`. `next`: `state` after `not_seen`; after `stalled` the wait's own,
 * `stop`, or a look again when its text was withheld from the Decision.
 */
export function waited(poll: CommandOutcome<WaitForResult>, acted: boolean, result: DoResult): Out {
  const effect = acted ? 'dispatched' : 'none';
  if (poll.status === 'ok') return { status: 'ok', acted, effect, result: { ...result, verdict: 'seen' } };
  const cause = poll.why?.cause ?? poll.status;
  const verdict = poll.result?.verdict === 'stalled' ? 'stalled' : 'not_seen';
  // A line the page already showed, unchanged, is no news of the steps: say so, as the success line may be one.
  const detail = `${poll.why?.detail ?? poll.status}; only text new since the steps began was judged`;
  const next = cause === 'not_seen' ? LOOK_AGAIN : poll.next ?? RE_OBSERVE;
  const ended: DoResult = { ...result, verdict };
  if (acted) return unconfirmed(ended, cause, detail, next);
  return { status: poll.status, acted: false, effect: 'none', result: ended, why: { cause, detail }, next };
}
