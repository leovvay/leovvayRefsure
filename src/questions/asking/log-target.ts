import type { RunTrace } from '../../output';
import type { SiteId } from '../site-id';

/** Where a provider call is recorded: the egress log file, the verb and site it served, and the run's trace. */
export interface LogTarget { egressLog: string; command: string; site: SiteId; trace: RunTrace }
