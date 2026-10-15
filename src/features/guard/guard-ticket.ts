import { type CommandContext, type CommandOutcome, pinNextToPage } from '../../cli';
import { recheck } from '../../tickets';
import { nothingDone, recheckStale, ticketGone } from '../shared';
import type { GuardArgs } from './guard.args';
import type { GuardResult } from './guard.contract';

/**
 * `guard --ticket T` (spec §6.3): peeks the ticket (never claims it), then the same recheck `act` runs, on a fresh
 * snapshot of the ticket's page: URL, twin group, ordinal and row, and the risk read on the fresh tree, which can
 * only rise above the ticket's. Code only: nothing is sent or clicked.
 */
export async function guardTicket(
  args: Extract<GuardArgs, { mode: 'ticket' }>, ctx: CommandContext,
): Promise<CommandOutcome<GuardResult>> {
  const ticket = await ctx.tickets.peek(args.ticket, ctx.now());
  if (typeof ticket === 'string') return ticketGone(ticket, args.ticket);
  if (args.page !== null && args.page !== ticket.pageId) {
    return nothingDone('usage', 'usage', `ticket ${args.ticket} is for page ${ticket.pageId}, not ${args.page}: drop --page`);
  }
  const fresh = await recheck(ctx, ticket);
  if ('stale' in fresh) {
    return pinNextToPage(recheckStale(fresh.stale, ticket.id), { backend: ctx.browser.backend, id: ticket.pageId });
  }
  ctx.trace.untrusted.add('result.fingerprint');
  return {
    status: 'ok',
    acted: false,
    effect: 'none',
    result: { class: fresh.risk.class, reasons: fresh.risk.reasons, fingerprint: ticket.fingerprint, authority: ticket.authority },
  };
}
