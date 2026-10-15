import type { ActAction } from '../../browser';

/** `act --ticket T [--action a] [--value v] [--verify "<intent>"]`. */
export interface ActArgs {
  ticket: string;
  /** Overrides the default: the ticket's pre-bound action, else `click`. */
  action: ActAction | null;
  /** fill and select only. Never logged, never sent, never shown. */
  value: string | null;
  /** After the act, the outcome Noul over the before and after text; anything short of `landed` is exit 30. */
  verify: string | null;
  /** `--page`, when given: it must be the ticket's own page. */
  page: string | null;
}
