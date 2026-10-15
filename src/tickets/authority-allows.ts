import { HIGH_RISK, type RiskClass } from '../risk';
import type { Authority } from './ticket';

const RANK: Readonly<Record<Authority, number>> = { none: 0, read: 1, write: 2 };

/**
 * Whether a ticket's authority covers acting at `risk` (spec §8.3): `read` covers read, `write` covers read and
 * write, `none` covers nothing. A high-risk class is never covered: it goes to `act-high-risk`, not `act`.
 */
export function authorityAllows(authority: Authority, risk: RiskClass): boolean {
  if (HIGH_RISK.has(risk)) return false;
  return RANK[authority] >= (risk === 'read' ? RANK.read : RANK.write);
}
