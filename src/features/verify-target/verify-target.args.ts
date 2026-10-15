import type { Ref } from '../../browser';
import type { RiskClass } from '../../risk';

/** `verify-target --ref @eN --intent i [--risk r]`. */
export interface VerifyTargetArgs {
  ref: Ref;
  intent: string;
  /** Picks the `find` threshold row; the element's own class can only raise it. Without it, the strictest row. */
  risk?: RiskClass;
}
