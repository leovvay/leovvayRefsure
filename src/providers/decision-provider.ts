import type { ApprovedRequest } from '../egress';
import type { DecisionAnswer, ProviderId } from '../questions';

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
}

export interface DecisionProvider {
  id: ProviderId;
  model: string;
  host: string;
  capabilities: { wire: 'jev' | 'openai'; kinds: readonly ('choice' | 'noul')[]; refusal: boolean; maxQuestions: number };
  /** The exact wire body `ask` would send; used by `--dry-run`. Holds no key. */
  body(req: ApprovedRequest, opts: { rendering?: 'o_primary' | 'o_s2' }): unknown;
  ask(req: ApprovedRequest, opts: { deadlineMs: number; rendering?: 'o_primary' | 'o_s2'; signal: AbortSignal }): Promise<ProviderAnswer>;
}
