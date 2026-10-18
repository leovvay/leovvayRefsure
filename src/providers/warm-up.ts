/**
 * One connection opened at route approval (`preconnect`), in `performance.now()` times, for `REFSURE_RUN_TIMING`.
 * It names no host and holds nothing the provider sent.
 */
export interface WarmUp {
  /** When the connection was started, or passed over. */
  startedAt: number;
  /** When TLS was up (the certificate checked), or `null`. */
  readyAt: number | null;
  /** When the first request took the connection, or `null`. */
  takenAt: number | null;
  /** Why it closed before a request took it, or was never opened: an error code or a few words. */
  failed: string | null;
}
