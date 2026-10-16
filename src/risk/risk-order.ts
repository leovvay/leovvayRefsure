import type { RiskClass } from './risk-class';

/** Risk only rises: the max along this order wins (spec §8.1 invariant 4). */
export const RISK_ORDER: readonly RiskClass[] = ['read', 'write', 'consent', 'auth', 'money', 'irreversible'];

/** These never go through act, outcome, dismiss or pick-option (spec §8.1 invariant 5). */
export const HIGH_RISK: ReadonlySet<RiskClass> = new Set<RiskClass>(['money', 'irreversible', 'auth', 'consent']);
