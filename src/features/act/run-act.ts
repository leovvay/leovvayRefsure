import type { ActAction, ActResult, PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { cutName } from '../../page-model';
import { outcomeSite } from '../../questions';
import { recheck, type RecheckResult, type Ticket } from '../../tickets';
import { abstainOutcome, nothingDone, type PageReading, readPage, recheckStale, ticketGone } from '../shared';
import type { ActArgs } from './act.args';
import type { ActCommandResult } from './act.contract';
import { policyRefusal } from './act-policy';
import { dryVerify, verifyAfter } from './act-verify';
import { VALUE_ACTIONS } from './parse-act';

type Out = CommandOutcome<ActCommandResult>;
type Bound = { action: ActAction; value?: string };
type Fresh = Exclude<RecheckResult, { stale: unknown }>;

/**
 * The action and value to run: `--action`, else the ticket's pre-bound one, else click; values only for fill and
 * select. A ticket issued for one action and value (pick-option binds select and its option) runs only those:
 * another `--action` or `--value` is a usage error, never a quiet swap. The value itself is never quoted.
 */
function bind(args: ActArgs, ticket: Ticket): Bound | Out {
  if (args.action !== null && ticket.action !== undefined && args.action !== ticket.action) {
    return nothingDone('usage', 'usage', `ticket ${ticket.id} was issued for ${ticket.action}, not ${args.action}`);
  }
  if (args.value !== null && ticket.value !== undefined && args.value !== ticket.value) {
    const detail = `ticket ${ticket.id} was issued with its own value: drop --value, or get a ticket for the other one`;
    return nothingDone('usage', 'usage', detail);
  }
  const action = args.action ?? ticket.action ?? 'click';
  const value = args.value ?? ticket.value;
  if (VALUE_ACTIONS.has(action)) {
    if (value === undefined) return nothingDone('usage', 'usage', `${action} needs --value`);
    return { action, value };
  }
  if (args.value !== null) return nothingDone('usage', 'usage', `${action} takes no --value`);
  return { action };
}

/** The recheck, then the policy on its fresh risk: a fresh ref the act may use, or why nothing is done. */
async function cleared(ctx: CommandContext, ticket: Ticket, action: ActAction, cause?: 'page_changed'): Promise<Fresh | Out> {
  const fresh = await recheck(ctx, ticket, { action });
  if ('stale' in fresh) return recheckStale(cause ?? fresh.stale, ticket.id);
  return policyRefusal(ticket, fresh.risk, action) ?? fresh;
}

function isOut(value: object): value is Out {
  return 'status' in value;
}

/**
 * The ticket path (spec §8.3): peek, the page check, a reachability read and the `--verify` route check, all before
 * the ticket is spent; then claim, recheck, policy, and the typed act at once. A stale ref is re-found once on a
 * fresh snapshot; a second one is `page_changed`. Under `--dry-run` the ticket is only peeked, never claimed.
 */
export async function runAct(args: ActArgs, ctx: CommandContext): Promise<Out> {
  const peeked = await ctx.tickets.peek(args.ticket, ctx.now());
  if (typeof peeked === 'string') return ticketGone(peeked, args.ticket);
  if (args.page !== null && args.page !== peeked.pageId) {
    return nothingDone('usage', 'usage', `ticket ${args.ticket} is for page ${peeked.pageId}, not ${args.page}: drop --page`);
  }
  // The page comes from the ticket, so the registry resolved none: bound here, every `refsure` next step names
  // it, a failure thrown after the click (Orca gone: effect_unknown) included.
  const page: PageRef = { backend: ctx.browser.backend, id: peeked.pageId };
  ctx.page = page;
  return actOnTicket(args, ctx, peeked, page);
}

async function actOnTicket(args: ActArgs, ctx: CommandContext, peeked: Ticket, page: PageRef): Promise<Out> {
  const bound = bind(args, peeked);
  if (isOut(bound)) return bound;
  const tab = await ctx.browser.tabInfo(page);
  if (args.verify !== null) {
    const route = await ctx.routeCheck(outcomeSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
    if (!route.ok) {
      const verdict = {
        kind: 'abstain' as const, cause: route.cause, detail: route.detail, leaned: null, confidence: null, threshold: null,
      };
      return abstainOutcome<ActCommandResult>(verdict, null);
    }
  }
  // Read before the dispatch: a config error after it could only say effect_unknown.
  const piiMasks = args.verify === null ? true : ctx.config.piiMasks;

  const ticket = ctx.dryRun ? peeked : await ctx.tickets.claim(args.ticket, ctx.now());
  if (typeof ticket === 'string') return ticketGone(ticket, args.ticket);
  let fresh = await cleared(ctx, ticket, bound.action);
  if (isOut(fresh)) return fresh;
  const element = `${ticket.fingerprint.role} ${JSON.stringify(cutName(ticket.fingerprint.name))}`;
  ctx.trace.untrusted.add('result.element');
  const before: PageReading | null = args.verify === null ? null : await readPage(ctx.browser, page);
  if (ctx.dryRun && args.verify !== null && before !== null) {
    const { verdict } = await dryVerify(ctx, args.verify, element, before, piiMasks);
    if (verdict.kind === 'abstain') return abstainOutcome<ActCommandResult>(verdict, null);
  }

  let sent: ActResult = await ctx.browser.act(page, fresh.ref, bound.action, bound.value);
  let refound = false;
  if (sent.kind === 'stale_ref') {
    fresh = await cleared(ctx, ticket, bound.action, 'page_changed');
    if (isOut(fresh)) return fresh;
    sent = await ctx.browser.act(page, fresh.ref, bound.action, bound.value);
    refound = true;
    if (sent.kind === 'stale_ref') return recheckStale('page_changed', ticket.id);
  }
  const base = { action: bound.action, element, ...(refound ? { refound: true as const } : {}) };
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown', acted: true, effect: 'unknown', result: { verdict: 'unknown', ...base },
      why: { cause: 'effect_unknown', detail: sent.detail }, next: { do: 'snapshot', argv: ['refsure', 'snap'] },
    };
  }
  if (args.verify === null || before === null) {
    return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'done', ...base } };
  }
  return verifyAfter(ctx, page, { intent: args.verify, acted: element, before, piiMasks, base });
}
