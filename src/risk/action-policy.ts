import type { ActAction } from '../browser';
import { HIGH_RISK } from './risk-class';
import type { RiskClass } from './risk-class';

/** The command paths that act on a page. */
export type ActRoute = 'act' | 'outcome' | 'dismiss' | 'pick-option' | 'act-high-risk';

/**
 * Spec §8.1 invariant 5: money, irreversible, auth and consent never go through `act`, `outcome`, `dismiss` or
 * `pick-option`; only `act-high-risk` takes them. No class depends on the verb yet; `action` keeps the call
 * sites honest about what they are about to run.
 */
export function actionPolicy(
  action: ActAction, risk: RiskClass, route: ActRoute,
): 'allow' | { refuse: 'high_risk_class' } {
  void action;
  if (route === 'act-high-risk') return 'allow';
  return HIGH_RISK.has(risk) ? { refuse: 'high_risk_class' } : 'allow';
}
