import type { ActAction, PageHint, Ref } from '../../browser';
import type { RiskClass } from '../../risk';

/** How the element is named: a ticket (money, irreversible), or a live ref with the name the caller saw. */
export type HighRiskTarget = { kind: 'ticket'; ticket: string } | { kind: 'ref'; ref: Ref; expectName: string };

/**
 * `act-high-risk --class c (--ticket T | --ref @eN --expect-name n) --action a [--value v] --intent "<what>"`.
 * `value` is never logged, sent or shown.
 */
export interface ActHighRiskArgs {
  class: RiskClass;
  target: HighRiskTarget;
  action: ActAction;
  value: string | null;
  intent: string;
  /** `--page`: the page for `--ref`; with `--ticket` it must be the ticket's own. */
  hint: PageHint;
}
