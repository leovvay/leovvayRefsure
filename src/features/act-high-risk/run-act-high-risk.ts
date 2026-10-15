import { type PageRef, VALUE_ACTIONS } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { NEEDS_HUMAN, RE_OBSERVE } from '../../output';
import { gateHighRisk, type HighRiskGateResult, type Ticket } from '../../tickets';
import { nothingDone, peekTicketOnPage, ticketBindingRefusal } from '../shared';
import type { ActHighRiskArgs } from './act-high-risk.args';
import type { ActHighRiskResult } from './act-high-risk.contract';

type Out = CommandOutcome<ActHighRiskResult>;

/**
 * The value a ticket's act runs with. A ticket issued for one action and value runs only those
 * (`ticketBindingRefusal`); a fill or select takes the ticket's own value when `--value` is not given.
 */
function ticketValue(args: ActHighRiskArgs, ticket: Ticket): { value: string | undefined } | Out {
  const refused = ticketBindingRefusal<ActHighRiskResult>(ticket, args.action, args.value, 'drop --value');
  if (refused !== null) return refused;
  const value = args.value ?? ticket.value;
  if (VALUE_ACTIONS.has(args.action) && value === undefined) return nothingDone('usage', 'usage', `${args.action} needs --value`);
  return { value };
}

function stopped(ctx: CommandContext, gate: Extract<HighRiskGateResult, { ok: false }>): Out {
  // A name mismatch quotes the name the page shows.
  if (gate.cause === 'expect_name_mismatch') ctx.trace.untrusted.add('why.detail');
  const next = gate.status === 'refused' ? NEEDS_HUMAN : RE_OBSERVE;
  return nothingDone(gate.status, gate.cause, gate.detail, { next });
}

/**
 * The only path for money, irreversible, auth and consent (spec §6.3, §8.5). Every check runs before the dispatch
 * and none is a Decision: the gate (ticket fitness, a recheck before and after the claim, or the live name), then
 * `--class` against the fresh class (raised by `--risk`). Then the element is highlighted and the typed act runs
 * once; it is never retried.
 */
export async function runActHighRisk(args: ActHighRiskArgs, ctx: CommandContext): Promise<Out> {
  let page: PageRef;
  let value: string | undefined;
  let gate: HighRiskGateResult;
  const raise = args.risk === undefined ? {} : { risk: args.risk };
  if (args.target.kind === 'ticket') {
    const onPage = await peekTicketOnPage<ActHighRiskResult>(ctx, args.target.ticket, args.hint.page ?? null);
    if ('status' in onPage) return onPage;
    const peeked = onPage.ticket;
    page = onPage.page;
    const bound = ticketValue(args, peeked);
    if ('status' in bound) return bound;
    value = bound.value;
    gate = await gateHighRisk(ctx, { class: args.class, action: args.action, page, ticket: peeked, ...raise });
  } else {
    page = await ctx.browser.resolvePage(args.hint);
    ctx.page = page;
    value = args.value ?? undefined;
    gate = await gateHighRisk(ctx, {
      class: args.class, action: args.action, page, ref: args.target.ref, expectName: args.target.expectName, ...raise,
    });
  }
  if (!gate.ok) return stopped(ctx, gate);

  ctx.trace.untrusted.add('result.element');
  const base = { class: args.class, action: args.action, element: gate.element };
  // Under --dry-run the act below stops before anything reaches the page; the highlight would too.
  if (!ctx.dryRun && ctx.browser.highlight !== undefined) await ctx.browser.highlight(page, gate.ref);
  const sent = await ctx.browser.act(page, gate.ref, args.action, value);
  if (sent.kind === 'stale_ref') {
    return nothingDone('stale', 'ref_gone', `@${gate.ref} left the page before the act; nothing was dispatched`, { next: RE_OBSERVE });
  }
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown', acted: true, effect: 'unknown', result: { verdict: 'unknown', ...base },
      why: { cause: 'effect_unknown', detail: sent.detail }, next: RE_OBSERVE,
    };
  }
  return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'done', ...base } };
}
