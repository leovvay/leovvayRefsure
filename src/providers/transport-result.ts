import type { ProviderStatus } from './decision-provider';

/** One `postDecision` call, retries included. `ok` here means a 2xx JSON body, not yet a valid answer. */
export interface TransportResult {
  status: ProviderStatus;
  /** The parsed 2xx body; absent on every other status. */
  json?: unknown;
  /** Whole milliseconds over every attempt and the backoff. */
  ms: number;
  /** Why it is not `ok`; the key is replaced by `[key]`, and a response body never appears. */
  detail?: string;
}

/** `deadlineMs` covers every attempt and the backoff; `signal` stops it all. */
export interface PostOptions { deadlineMs: number; signal: AbortSignal }
