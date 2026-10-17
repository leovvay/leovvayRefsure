import { type CommandOutcome, failureOutcome } from '../../cli';
import { causeStatus, NEEDS_HUMAN, type Next, RE_OBSERVE, type Status } from '../../output';
import type { AbstainVerdict } from '../../questions';
import { abstainOutcome } from '../shared';
import type { RunResult, RunVerdict } from './run.contract';
import type { RunStop } from './run-stop';

type Out = CommandOutcome<RunResult>;

/** Look at the page as a whole: the run ended short of what was asked, and why is on the page. */
const LOOK: Next = { do: 'state' };
/** Where each end goes when its stop names no way on. */
const NEXT_OF: Partial<Record<RunVerdict, Next>> = {
  done_unconfirmed: LOOK, blocked: LOOK, budget: LOOK, no_progress: RE_OBSERVE, low_confidence: RE_OBSERVE,
};
/** A step pick the model was unsure of; any other abstain means no Decision could be had. */
const UNSURE: ReadonlySet<string> = new Set(['low_confidence', 'none_chosen', 'twins']);

/**
 * How `run` ends (design 2026-10-17 §3). `seen` is ok, with or without an act. Anything else after an act is
 * `effect_unknown` (exit 30), its cause in `result.unconfirmed`. With nothing acted it is the cause's own status.
 */
export function ended(stop: RunStop, acted: boolean, result: RunResult): Out {
  const final: RunResult = { ...result, verdict: stop.verdict };
  if (stop.verdict === 'seen') {
    const out: Out = { status: 'ok', acted, effect: acted ? 'dispatched' : 'none', result: final };
    if (stop.byCode) out.settledByCode = true;
    return out;
  }
  const next = stop.next ?? NEXT_OF[stop.verdict] ?? RE_OBSERVE;
  if (acted) {
    const detail = stop.cause === 'effect_unknown' ? stop.detail : `dispatched; not confirmed (${stop.cause}): ${stop.detail}`;
    return {
      status: 'effect_unknown', acted: true, effect: stop.effect ?? 'dispatched', result: { ...final, unconfirmed: stop.cause },
      why: { cause: 'effect_unknown', detail }, next,
    };
  }
  const status: Status = stop.status ?? causeStatus(stop.cause);
  return { status, acted: false, effect: 'none', result: final, why: { cause: stop.cause, detail: stop.detail }, next };
}

/** A step Decision that gave no answer: an unsure pick is `low_confidence`; any other is `decision_unavailable`. */
export function abstainStop(verdict: AbstainVerdict<unknown>): RunStop {
  const { status, next } = abstainOutcome(verdict, null);
  const stop: RunStop = {
    verdict: UNSURE.has(verdict.cause) ? 'low_confidence' : 'decision_unavailable',
    cause: verdict.cause, detail: verdict.detail, status,
  };
  if (next) stop.next = next;
  return stop;
}

/** A new model family answered: authority `none` (spec §8.6), so none of its picks is acted on. */
export function newFamilyStop(model: string | undefined): RunStop {
  return {
    verdict: 'decision_unavailable', cause: 'proposed_only', next: NEEDS_HUMAN,
    detail: `a model family refsure has not measured answered (${model ?? 'unnamed'}): run acts on none of its picks`,
  };
}

/**
 * A browser call failed after something acted (a click closed the tab, Orca restarted): exit 30 as the registry would
 * give, with the steps so far kept and the browser's cause in `result.unconfirmed`.
 */
export function failedAfterAct(error: unknown, result: RunResult): Out {
  const { why } = failureOutcome(error, false);
  const cause = why?.cause ?? 'browser_error';
  return ended({ verdict: 'stopped', cause, detail: why?.detail ?? cause, next: RE_OBSERVE }, true, result);
}
