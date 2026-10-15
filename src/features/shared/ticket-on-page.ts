import type { PageRef } from '../../browser';
import type { Ticket } from '../../tickets';

/** A peeked ticket and the page it names, bound as `ctx.page`. */
export interface TicketOnPage { ticket: Ticket; page: PageRef }
