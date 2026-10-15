import type { Next, Status, Why } from '../output';

export interface CommandOutcome<Result> {
  status: Status;
  acted: boolean;
  effect: 'none' | 'dispatched' | 'unknown';
  result: Result | null;
  why?: Why;
  next?: Next;
  /**
   * Code settled the result (spec §6.1): the envelope's `decision` is null even when a Decision was asked on the
   * way to it, e.g. a wait whose literal appeared after an abstained poll. `egress` still lists every call.
   */
  settledByCode?: true;
}
