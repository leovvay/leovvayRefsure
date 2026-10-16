import type { RiskClass } from './risk-class';
import { RISK_ORDER } from './risk-order';

/** The highest class along `RISK_ORDER` (spec §8.1 invariant 4); `read` when given none. */
export function maxRisk(...r: RiskClass[]): RiskClass {
  let top = 0;
  for (const c of r) {
    const at = RISK_ORDER.indexOf(c);
    if (at > top) top = at;
  }
  return RISK_ORDER[top] ?? 'read';
}
