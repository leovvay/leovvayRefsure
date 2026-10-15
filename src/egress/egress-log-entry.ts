import type { ProviderId, SiteId } from '../questions';

/**
 * One line of `egress.log`. Sizes, a digest and outcome only: never content. `t` is epoch ms; `status` is the
 * provider status (`ok`, `timeout`, `http_429`, …), `pending` on the reservation written before a call is sent, or
 * `unsent` when it never left; `usd` is null when the provider did not report a cost.
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
  /** The call's id: its reservation line and the line that settles it share it. Absent on older lines. */
  call?: string;
}
