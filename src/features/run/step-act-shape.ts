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
  /**
   * For an element with identical twins, the text of the row the table told it apart by (`row="…"`): the same
   * ordinal in another row is another element.
   */
  row?: string;
}

/**
 * The raiser count (`noRaiserOnPage`) taken on a look while its Decision is asked, the browser idle meanwhile: the
 * look's signature, whether the page held no raiser then, and whether it held no editable region either, so a fill
 * may take the one-call path (`fillInput`). Each is false when it could not be read or was not counted.
 */
export interface RaiserProbe { sig: string; none: Promise<boolean>; plain: Promise<boolean> }

/**
 * The guard's answer: clear to act on the fresh ref; stale (nothing sent, the fresh snapshot is the next look);
 * or a stop with its status, cause and way on.
 */
export type Guarded =
  | { kind: 'clear'; ref: Ref; node: number; risk: RiskReading; fresh: RunLook }
  | { kind: 'stale'; cause: 'page_changed' | 'ref_gone'; detail: string; fresh: RunLook }
  | { kind: 'stop'; status: Status; cause: string; detail: string; next?: Next; risk?: RiskClass };
