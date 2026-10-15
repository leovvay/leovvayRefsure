import type { ActAction } from '../../browser';
import type { RiskClass } from '../../risk';

/**
 * `refsure act-high-risk`: the class that matched a fresh read, the action dispatched, and the element as
 * `<role> "<name>"` (page text). `verdict` is `done` once the act ran; nothing confirms its effect.
 */
export interface ActHighRiskResult {
  verdict: 'done' | 'unknown';
  class: RiskClass;
  action: ActAction;
  element: string;
}
