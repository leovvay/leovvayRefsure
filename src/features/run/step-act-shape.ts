import type { Ref } from '../../browser';
import type { Next, Status } from '../../output';
import type { Candidate } from '../../page-model';
import type { RiskClass, RiskReading } from '../../risk';
import type { RunLook } from './run-look-shape';

/**
 * One act a step chose: the operation, the element as the look the Decision read showed it, the value (a TYPE's
 * `--fill` value, a SELECT's option label), the confidence its risk row is held to, and where it sits.
 */
export interface StepAct {
  op: 'CLICK' | 'TYPE' | 'SELECT' | 'PRESS_ENTER';
  cand: Candidate;
  value?: string;
  p: number;
  /** The element sits in a dialog, which a click may close. */
  inDialog: boolean;
}

/**
 * The guard's answer: clear to act on the fresh ref; stale (nothing sent, the fresh snapshot is the next look);
 * or a stop with its status, cause and way on.
 */
export type Guarded =
  | { kind: 'clear'; ref: Ref; risk: RiskReading; fresh: RunLook }
  | { kind: 'stale'; cause: 'page_changed' | 'ref_gone'; detail: string; fresh: RunLook }
  | { kind: 'stop'; status: Status; cause: string; detail: string; next?: Next; risk?: RiskClass };
