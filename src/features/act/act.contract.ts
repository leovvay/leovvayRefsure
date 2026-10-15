import type { ActAction } from '../../browser';

/**
 * `refsure act`: `done` when the typed act ran and nothing was asked to confirm it; with `--verify`, `landed` when
 * the outcome Decision saw the intent happen, else `unknown` (exit 30), never "failed". `element` is page text.
 */
export interface ActCommandResult {
  verdict: 'done' | 'landed' | 'unknown';
  action: ActAction;
  /** `<role> "<name>"` of the element acted on, from the ticket's fingerprint. */
  element: string;
  /** The first ref went stale and the element was found again on a fresh snapshot. */
  refound?: true;
  /** `--verify`: why `landed` was not confirmed (`low_confidence`, `provider_timeout`, ...). */
  unconfirmed?: string;
}
