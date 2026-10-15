import type { ActAction } from '../browser';
import type { Fingerprint } from '../page-model';
import type { Maturity, SiteId } from '../questions';
import type { RiskClass } from '../risk';

/** What `act` may do with a ticket: `none` is propose-only. */
export type Authority = 'none' | 'read' | 'write';

export interface Ticket {
  id: string;
  pageId: string;
  urlNorm: string;
  fingerprint: Fingerprint;
  /** Always the computed class. */
  risk: RiskClass;
  authority: Authority;
  site: SiteId | 'code';
  maturity: Maturity;
  confidence: number | null;
  model: string | null;
  createdAt: number;
  ttlMs: number;
  /** pick-option pre-binds `select` and the option. */
  action?: ActAction;
  value?: string;
}
