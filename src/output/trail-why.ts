/**
 * Why an act was taken, as the in-page trail shows it: by a Decision (its site, model, the confidence the act was
 * allowed on and the threshold it was held to), by code, or by the agent's own ref. A feature that knows the exact
 * numbers sets it on the trace right before its act (`RunTrace.trailWhy`); the trail reads it once, at that act.
 * It lives here, not in `trail`, so a feature and the trace can name it without importing the trail domain.
 */
export interface TrailWhy {
  by: 'decision' | 'code' | 'agent';
  site?: string;
  model?: string;
  /** The confidence the act was allowed on, 0..1. */
  p?: number;
  /** The threshold `p` was held to, 0..1. */
  threshold?: number;
}
