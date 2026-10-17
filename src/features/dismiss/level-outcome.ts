import type { AxTree } from '../../browser';
import type { Next, Status, Why } from '../../output';
import type { DismissLevelReport } from './dismiss-level-report';

/** One level's report, and the status it would give on its own. `clicked`: a click was dispatched at this level. */
export interface LevelOutcome {
  report: DismissLevelReport;
  status: Status;
  why?: Why;
  next?: Next;
  clicked: boolean;
  /** After a click: `unknown` when the click itself may or may not have landed. */
  effect?: 'dispatched' | 'unknown';
  /** After a dismissed overlay: the snapshot that showed it gone, the page as it now is. */
  tree?: AxTree;
}
