import type { RefsureConfig } from '../config';
import type { ProviderId, SiteId } from '../questions';
import type { EgressLogEntry } from './egress-log-entry';

/** What `approve` checks one provider part against. `egressLog` holds at least the last 24 h. */
export interface ApproveContext {
  site: SiteId;
  provider: ProviderId;
  /** The host the request goes to; consent is granted per provider and host. */
  host: string;
  /** The page URL, checked against allow/deny origins; `null` for synthetic input that holds no page content. */
  originUrl: string | null;
  /** Orca's profile id for the tab, `null` when unknown. */
  profileId: string | null;
  config: RefsureConfig;
  /** Skips the consent step only: a dry run still shows what origin, bounds and limits would refuse. */
  dryRun: boolean;
  nowMs: number;
  egressLog: readonly EgressLogEntry[];
  /** Calls the same Decision makes alongside this one, not yet in `egressLog`; they count toward the cap. */
  pending?: number;
}
