import type { Ticket } from './ticket';

export type ClaimFailure = 'ticket_used' | 'ticket_expired';

export interface TicketBook {
  issue(t: Omit<Ticket, 'id' | 'createdAt' | 'ttlMs'>): Promise<Ticket>;
  /** Single use: a second claim is `ticket_used`; expiry never refreshes. */
  claim(id: string, nowMs: number): Promise<Ticket | ClaimFailure>;
  peek(id: string, nowMs: number): Promise<Ticket | ClaimFailure>;
}
