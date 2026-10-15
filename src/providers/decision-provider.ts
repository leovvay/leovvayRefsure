import type { ApprovedRequest } from '../egress';
import type { DecisionAnswer, ProviderId } from '../questions';
import type { Rendering } from './rendering';

export type ProviderStatus = 'ok' | 'refusal' | 'invalid' | 'timeout' | 'transport' | `http_${number}`;

export interface ProviderAnswer {
  status: ProviderStatus;
  /** Present and complete for every question only when `status` is `ok`. */
  answers: Record<string, DecisionAnswer> | null;
  model: string | null;
  usd: number | null;
  ms: number;
  /** Why it is not `ok`, in refsure's own words: never a key, a response body or model output. */
  detail?: string;
  /** Refused before anything was sent (another host, no key, interrupted): no egress, nothing to count. */
  unsent?: true;
}

export interface DecisionProvider {
  id: ProviderId;
  model: string;
  host: string;
  /** The exact wire body `ask` would send; used by `--dry-run`. Holds no key. */
  body(req: ApprovedRequest, opts: { rendering?: Rendering }): unknown;
  ask(req: ApprovedRequest, opts: { deadlineMs: number; rendering?: Rendering; signal: AbortSignal }): Promise<ProviderAnswer>;
}
