import type { Next, Status, Why } from '../output';

export interface CommandOutcome<Result> {
  status: Status;
  acted: boolean;
  effect: 'none' | 'dispatched' | 'unknown';
  result: Result | null;
  why?: Why;
  next?: Next;
}
