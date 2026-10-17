import type { StepAction } from './do-step';

/**
 * One step as `do` ran it. `target` is the agent's own text; `element` is page text: `<role> "<name>"` once acted on,
 * the pick as a v1 line when it stopped after locating, else null. Never a value.
 */
export interface DoStepReport {
  step: StepAction;
  target: string;
  element: string | null;
  by: 'code' | 'decision' | null;
  /** `done`: the act ran; `unknown`: it was sent, unconfirmed; `stopped`: `do` stopped here; `not_run`: never reached. */
  verdict: 'done' | 'unknown' | 'stopped' | 'not_run';
  /** Where it stopped: the cause the step's own verb gave. */
  cause?: string;
  /** It was located again on a fresh snapshot: it was not found up front, or its element moved before the act. */
  located_again?: true;
  /** Where it stopped: the step's own verb result (`locate`'s or `act`'s), e.g. the twin rows. */
  result?: unknown;
}
