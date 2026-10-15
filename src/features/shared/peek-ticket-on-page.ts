import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { nothingDone, ticketGone } from './nothing-done';
import type { TicketOnPage } from './ticket-on-page';

/**
 * The ticket prelude of `act`, `act-high-risk --ticket` and `guard --ticket`: peek (never claim) the ticket, hold a
 * given `--page` to the ticket's own, then bind its page. The registry resolved none, so from here the envelope
 * and every `refsure` next step name it, a failure thrown after a click (Orca gone: effect_unknown) included.
 */
export async function peekTicketOnPage<Result>(
  ctx: CommandContext, id: string, page: string | null,
): Promise<TicketOnPage | CommandOutcome<Result>> {
  const ticket = await ctx.tickets.peek(id, ctx.now());
  if (typeof ticket === 'string') return ticketGone(ticket, id);
  if (page !== null && page !== ticket.pageId) {
    return nothingDone('usage', 'usage', `ticket ${id} is for page ${ticket.pageId}, not ${page}: drop --page`);
  }
  const bound: PageRef = { backend: ctx.browser.backend, id: ticket.pageId };
  ctx.page = bound;
  return { ticket, page: bound };
}
