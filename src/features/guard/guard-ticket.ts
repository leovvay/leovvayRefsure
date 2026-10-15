import type { CommandContext, CommandOutcome } from '../../cli';
import { recheck } from '../../tickets';
import { peekTicketOnPage, recheckStale } from '../shared';
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
  // The ticket names the page: the envelope and a `refsure` next step name it too (see CommandContext.page).
  const onPage = await peekTicketOnPage<GuardResult>(ctx, args.ticket, args.page);
  if ('status' in onPage) return onPage;
  const { ticket } = onPage;
  const fresh = await recheck(ctx, ticket);
  if ('stale' in fresh) return recheckStale(fresh.stale, ticket.id);
  ctx.trace.untrusted.add('result.fingerprint');
  return {
    status: 'ok',
    acted: false,
    effect: 'none',
    result: { class: fresh.risk.class, reasons: fresh.risk.reasons, fingerprint: ticket.fingerprint, authority: ticket.authority },
  };
}
