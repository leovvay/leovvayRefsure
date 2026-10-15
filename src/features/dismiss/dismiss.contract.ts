import type { DismissLevelReport } from './dismiss-level-report';

/**
 * `refsure dismiss`: `dismissed` when some level clicked and its overlay went away; else the first level's own
 * verdict (`no_overlay`, `proposed`, `vetoed`, ...). `levels` holds every level tried, in order.
 */
export interface DismissResult {
  verdict: DismissLevelReport['verdict'];
  levels: DismissLevelReport[];
}
