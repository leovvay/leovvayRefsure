import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { gateHighRisk, type HighRiskGateResult, type Ticket } from '../../tickets';
import { nothingDone, ticketGone } from '../shared';
import type { ActHighRiskArgs } from './act-high-risk.args';
import type { ActHighRiskResult } from './act-high-risk.contract';
import { VALUE_ACTIONS } from './parse-act-high-risk';

type Out = CommandOutcome<ActHighRiskResult>;

const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
const HUMAN: Next = { do: 'needs_human' };

/**
 * The value a ticket's act runs with. A ticket issued for one action and value (pick-option binds select and its
 * option) runs only those: another `--action` or `--value` is a usage error, never a quiet swap.
 */
function ticketValue(args: ActHighRiskArgs, ticket: Ticket): { value: string | undefined } | Out {
  if (ticket.action !== undefined && ticket.action !== args.action) {
    return nothingDone('usage', 'usage', `ticket ${ticket.id} was issued for ${ticket.action}, not ${args.action}`);
  }
  if (args.value !== null && ticket.value !== undefined && args.value !== ticket.value) {
    return nothingDone('usage', 'usage', `ticket ${ticket.id} was issued with its own value: drop --value`);
  }
  const value = args.value ?? ticket.value;
  if (VALUE_ACTIONS.has(args.action) && value === undefined) return nothingDone('usage', 'usage', `${args.action} needs --value`);
  return { value };
}

function stopped(ctx: CommandContext, gate: Extract<HighRiskGateResult, { ok: false }>): Out {
  // A name mismatch quotes the name the page shows.
  if (gate.cause === 'expect_name_mismatch') ctx.trace.untrusted.add('why.detail');
  const next = gate.status === 'refused' ? HUMAN : SNAPSHOT;
  return nothingDone(gate.status, gate.cause, gate.detail, { next });
}

/**
 * The only path for money, irreversible, auth and consent (spec §6.3, §8.5). Every check runs before the dispatch
 * and none is a Decision: the gate (ticket fitness, claim and recheck, or the live name), then `--class` against
 * the fresh class. Then the element is highlighted and the typed act runs once; it is never retried.
 */
export async function runActHighRisk(args: ActHighRiskArgs, ctx: CommandContext): Promise<Out> {
  let page: PageRef;
  let value: string | undefined;
  let gate: HighRiskGateResult;
  if (args.target.kind === 'ticket') {
    const peeked = await ctx.tickets.peek(args.target.ticket, ctx.now());
    if (typeof peeked === 'string') return ticketGone(peeked, args.target.ticket);
    if (args.hint.page !== undefined && args.hint.page !== peeked.pageId) {
      return nothingDone('usage', 'usage', `ticket ${peeked.id} is for page ${peeked.pageId}, not ${args.hint.page}: drop --page`);
    }
    page = { backend: ctx.browser.backend, id: peeked.pageId };
    ctx.page = page;
    const bound = ticketValue(args, peeked);
    if ('status' in bound) return bound;
    value = bound.value;
    gate = await gateHighRisk(ctx, { class: args.class, action: args.action, page, ticket: peeked });
  } else {
    page = await ctx.browser.resolvePage(args.hint);
    ctx.page = page;
    value = args.value ?? undefined;
    gate = await gateHighRisk(ctx, {
      class: args.class, action: args.action, page, ref: args.target.ref, expectName: args.target.expectName,
    });
  }
  if (!gate.ok) return stopped(ctx, gate);

  ctx.trace.untrusted.add('result.element');
  const base = { class: args.class, action: args.action, element: gate.element };
  // Under --dry-run the act below stops before anything reaches the page; the highlight would too.
  if (!ctx.dryRun && ctx.browser.highlight !== undefined) await ctx.browser.highlight(page, gate.ref);
  const sent = await ctx.browser.act(page, gate.ref, args.action, value);
  if (sent.kind === 'stale_ref') {
    return nothingDone('stale', 'ref_gone', `@${gate.ref} left the page before the act; nothing was dispatched`, { next: SNAPSHOT });
  }
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown', acted: true, effect: 'unknown', result: { verdict: 'unknown', ...base },
      why: { cause: 'effect_unknown', detail: sent.detail }, next: SNAPSHOT,
    };
  }
  return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'done', ...base } };
}
