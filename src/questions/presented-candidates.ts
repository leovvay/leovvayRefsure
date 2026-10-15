/**
 * `page` keeps the caller's order; it exists for calibration alone, to measure what the shuffle changes.
 * `salt` presents one request in several orders.
 */
export type CandidateOrder = { kind: 'shuffled'; salt?: string } | { kind: 'page' };

export interface PresentedCandidates {
  /** Criteria keyed "1".."n" in presented order, then `none`. */
  criteria: Record<string, string>;
  /** The caller's index for a presented key; `null` for `none` or a key that was never offered. */
  indexOf(key: string): number | null;
}
