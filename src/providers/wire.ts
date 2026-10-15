import type { ApprovedRequest } from '../egress';
import type { DecisionAnswer, DecisionQuestion } from '../questions';
import type { Rendering } from './rendering';

/** A 2xx body read back to the Jev answer shape. */
export interface WireReading {
  status: 'ok' | 'invalid' | 'refusal';
  /** Complete for every question asked when `status` is `ok`, else `null`. */
  answers: Record<string, DecisionAnswer> | null;
  /** Kept on an invalid answer too: the call was made and may be billed. */
  model: string | null;
  usd: number | null;
  detail?: string;
}

/** One request/response shape: Jev's `systemone` or OpenAI's `/v1/decisions`. */
export interface Wire {
  id: 'jev' | 'openai';
  kinds: readonly ('choice' | 'noul')[];
  refusal: boolean;
  body(model: string, req: ApprovedRequest, rendering?: Rendering): unknown;
  read(json: unknown, questions: Readonly<Record<string, DecisionQuestion>>): WireReading;
}
