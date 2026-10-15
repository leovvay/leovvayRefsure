import type { StateStore } from '../local-state';
import { newTicketId } from './new-id';
import type { Ticket } from './ticket';
import type { ClaimFailure, TicketBook } from './ticket-book';
import { asTicket } from './ticket-shape';

export const TICKET_TTL_MS = 120_000;

/** Single-use tickets on a StateStore (spec §8.7). */
export function createTicketBook(store: StateStore, now: () => number = Date.now): TicketBook {
  return {
    async issue(t) {
      const ticket: Ticket = { ...t, id: newTicketId(), createdAt: now(), ttlMs: TICKET_TTL_MS };
      await store.put(ticket.pageId, 'ticket', ticket.id, ticket);
      return ticket;
    },

    async claim(id, nowMs) {
      // The store's claim is the atomic rename: a second claimer, or a claim of an unknown id, finds it gone.
      const hit = await store.claim('ticket', id);
      return hit === 'gone' ? 'ticket_used' : judge(hit, id, nowMs);
    },

    async peek(id, nowMs) {
      const hit = await store.find('ticket', id);
      return hit === null ? 'ticket_used' : judge(hit, id, nowMs);
    },
  };
}

function judge(hit: { pageId: string; value: unknown }, id: string, nowMs: number): Ticket | ClaimFailure {
  const ticket = asTicket(hit.value);
  // A malformed or misfiled entry can never be acted on; once claimed it is spent like any other.
  if (!ticket || ticket.id !== id || ticket.pageId !== hit.pageId) return 'ticket_used';
  // Expiry counts from the stored createdAt; reading never refreshes it.
  return nowMs >= ticket.createdAt + ticket.ttlMs ? 'ticket_expired' : ticket;
}
