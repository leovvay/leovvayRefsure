import type { DecisionAnswer } from '../../../src/questions';

/** What one Jev call gave, after the harness's own retries. `answers` is set only on `ok`. */
export interface JevAnswer {
  status: string;
  answers: Record<string, DecisionAnswer> | null;
  model: string | null;
  usd: number | null;
  ms: number;
  attempts: number;
  /** The approved request's canonical sha256: what refsure would log for this call. */
  digest: string | null;
  detail?: string;
}
