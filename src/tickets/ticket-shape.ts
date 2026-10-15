import type { Fingerprint } from '../page-model';
import { RISK_ORDER } from '../risk';
import type { Ticket } from './ticket';

const AUTHORITIES: readonly string[] = ['none', 'read', 'write'];
const MATURITIES: readonly string[] = ['measured', 'inherited', 'experimental'];
const ACTIONS: readonly string[] = ['click', 'dblclick', 'fill', 'select', 'check', 'uncheck'];

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStringOrNull = (v: unknown): boolean => v === null || typeof v === 'string';

function isFingerprint(v: unknown): v is Fingerprint {
  if (typeof v !== 'object' || v === null) return false;
  const f = v as Record<string, unknown>;
  return typeof f.role === 'string' && typeof f.name === 'string' && typeof f.path === 'string'
    && isCount(f.ordinal) && isCount(f.twins) && f.ordinal <= f.twins;
}

/** A stored ticket read back from disk, checked field by field; anything else is not a ticket. */
export function asTicket(value: unknown): Ticket | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Record<string, unknown>;
  const ok = typeof t.id === 'string' && typeof t.pageId === 'string' && typeof t.urlNorm === 'string'
    && isFingerprint(t.fingerprint)
    && typeof t.risk === 'string' && (RISK_ORDER as readonly string[]).includes(t.risk)
    && typeof t.authority === 'string' && AUTHORITIES.includes(t.authority)
    && typeof t.site === 'string'
    && typeof t.maturity === 'string' && MATURITIES.includes(t.maturity)
    && (t.confidence === null || typeof t.confidence === 'number')
    && isStringOrNull(t.model)
    && isTime(t.createdAt) && isTime(t.ttlMs)
    && (t.action === undefined || (typeof t.action === 'string' && ACTIONS.includes(t.action)))
    && (t.value === undefined || typeof t.value === 'string')
    && (t.within === undefined || (typeof t.within === 'string' && t.within !== ''))
    && (t.tabKey === undefined || (typeof t.tabKey === 'string' && t.tabKey !== ''));
  return ok ? (value as Ticket) : null;
}
