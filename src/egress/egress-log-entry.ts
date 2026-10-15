import type { ProviderId, SiteId } from '../questions';

/**
 * One provider call in `egress.log`, one JSON line each. Sizes, a digest and outcome only: never content.
 * `t` is epoch ms; `status` is the provider status (`ok`, `timeout`, `http_429`, …); `usd` is null when the
 * provider did not report a cost.
 */
export interface EgressLogEntry {
  t: number;
  command: string;
  site: SiteId;
  provider: ProviderId;
  host: string;
  bytes: number;
  digest: string;
  status: string;
  usd: number | null;
  model: string | null;
}
