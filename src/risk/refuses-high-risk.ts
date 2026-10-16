import type { RiskClass } from './risk-class';
import { HIGH_RISK } from './risk-order';

/**
 * Spec §8.1 invariant 5: money, irreversible, auth and consent never go through `act`, `outcome`, `dismiss` or
 * `pick-option`, whatever the action; only `act-high-risk` takes them, behind its own class check. Each of those
 * paths asks this before its first dispatch.
 */
export function refusesHighRisk(risk: RiskClass): boolean {
  return HIGH_RISK.has(risk);
}
