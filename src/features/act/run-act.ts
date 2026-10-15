import { type ActAction, type ActResult, type PageRef, type TabInfo, VALUE_ACTIONS } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { describeElement } from '../../page-model';
import { outcomeSite } from '../../questions';
import { HIGH_RISK } from '../../risk';
import { recheck, type RecheckResult, type Ticket } from '../../tickets';
import {
  abstainOutcome, nothingDone, type PageReading, peekTicketOnPage, readPage, recheckStale, ticketBindingRefusal,
  ticketGone,
} from '../shared';
import type { ActArgs } from './act.args';
import type { ActCommandResult } from './act.contract';
import { policyRefusal } from './act-policy';
import type { PolicyAct } from './policy-act';
import { dryVerify, verifyAfter } from './act-verify';

type Out = CommandOutcome<ActCommandResult>;
type Bound = { action: ActAction; value?: string };
type Fresh = Exclude<RecheckResult, { stale: unknown }>;
type Sent = { sent: ActResult; refound: boolean };

/**
 * The action and value to run: `--action`, else the ticket's pre-bound one, else click; values only for fill and
 * select. A ticket issued for one action and value runs only those (`ticketBindingRefusal`).
 */
function bind(args: ActArgs, ticket: Ticket): Bound | Out {
  const refused = ticketBindingRefusal<ActCommandResult>(
    ticket, args.action, args.value, 'drop --value, or get a ticket for the other one',
  );
  if (refused !== null) return refused;
  const action = args.action ?? ticket.action ?? 'click';
  const value = args.value ?? ticket.value;
  if (VALUE_ACTIONS.has(action)) {
    if (value === undefined) return nothingDone('usage', 'usage', `${action} needs --value`);
    return { action, value };
  }
  if (args.value !== null) return nothingDone('usage', 'usage', `${action} takes no --value`);
  return { action };
}

/**
 * The recheck, then the policy on its fresh risk: a fresh ref the act may use, or why nothing is done. `spent`:
 * the ticket was claimed, so a high-risk refusal can point only to the fresh ref, not to the ticket.
 */
async function cleared(
  ctx: CommandContext, ticket: Ticket, act: PolicyAct, spent: boolean, cause?: 'page_changed',
): Promise<Fresh | Out> {
  const fresh = await recheck(ctx, ticket, { action: act.action });
  if ('stale' in fresh) return recheckStale(cause ?? fresh.stale, ticket.id);
  return policyRefusal(ctx, ticket, fresh, act, spent) ?? fresh;
}

function isOut(value: object): value is Out {
  return 'status' in value;
}

/**
 * `--verify` asks the outcome Decision after the act, so its route (keys, consent, provider, origin, caps) is
 * checked before the ticket is spent: a refusal never comes after the click. `null`: no `--verify`, or the route is open.
 */
async function verifyRouteRefusal(ctx: CommandContext, tab: TabInfo, args: ActArgs): Promise<Out | null> {
  if (args.verify === null) return null;
  const route = await ctx.routeCheck(outcomeSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
  return route.ok ? null : abstainOutcome<ActCommandResult>(route, null);
}

/**
 * The typed act on the fresh ref, at once. A stale ref is re-found once on a fresh snapshot (recheck and policy
 * again); a second stale ref is `page_changed`. An act that may have landed is never sent twice.
 */
async function dispatchWithRefind(
  ctx: CommandContext, page: PageRef, ticket: Ticket, policy: PolicyAct, fresh: Fresh,
): Promise<Sent | Out> {
  const first = await ctx.browser.act(page, fresh.ref, policy.action, policy.value);
  if (first.kind !== 'stale_ref') return { sent: first, refound: false };
  const again = await cleared(ctx, ticket, policy, !ctx.dryRun, 'page_changed');
  if (isOut(again)) return again;
  const sent = await ctx.browser.act(page, again.ref, policy.action, policy.value);
  if (sent.kind === 'stale_ref') return recheckStale('page_changed', ticket.id);
  return { sent, refound: true };
}

/**
 * The ticket path (spec §8.3): the binding, a reachability read, the `--verify` route check and its before-read,
 * all before the ticket is spent; then claim, recheck, policy, and the typed act at once, with no other browser
 * call between the recheck and the act. A stale ref is re-found once on a fresh snapshot; a second one is
 * `page_changed`. Under `--dry-run` the ticket is only peeked, never claimed.
 */
async function actOnTicket(args: ActArgs, ctx: CommandContext, peeked: Ticket, page: PageRef): Promise<Out> {
  const bound = bind(args, peeked);
  if (isOut(bound)) return bound;
  const tab = await ctx.browser.tabInfo(page);
  const refusal = await verifyRouteRefusal(ctx, tab, args);
  if (refusal !== null) return refusal;
  // Read before the dispatch: a config error after it could only say effect_unknown.
  const piiMasks = args.verify === null ? true : ctx.config.piiMasks;
  const policy: PolicyAct = { ...bound, intent: args.verify };
  // Risk only rises, so a ticket issued at a high-risk class can never pass act: refuse before spending it, so the
  // refusal can hand it on to act-high-risk (spec §6.3). The fresh read still names the class and the ref.
  if (HIGH_RISK.has(peeked.risk)) {
    const kept = await cleared(ctx, peeked, policy, false);
    if (isOut(kept)) return kept;
  }
  // `--verify`'s before-side, read before the claim: a failed read leaves the ticket unspent, and no read sits
  // between the recheck and the act, where a renumbering snapshot could move the ref.
  const before: PageReading | null = args.verify === null ? null : await readPage(ctx.browser, page);

  const ticket = ctx.dryRun ? peeked : await ctx.tickets.claim(args.ticket, ctx.now());
  if (typeof ticket === 'string') return ticketGone(ticket, args.ticket);
  const fresh = await cleared(ctx, ticket, policy, !ctx.dryRun);
  if (isOut(fresh)) return fresh;
  const element = describeElement(ticket.fingerprint.role, ticket.fingerprint.name);
  ctx.trace.untrusted.add('result.element');
  if (ctx.dryRun && args.verify !== null && before !== null) {
    const { verdict } = await dryVerify(ctx, { intent: args.verify, acted: element, before, piiMasks, value: policy.value });
    if (verdict.kind === 'abstain') return abstainOutcome<ActCommandResult>(verdict, null);
  }

  const dispatched = await dispatchWithRefind(ctx, page, ticket, policy, fresh);
  if (isOut(dispatched)) return dispatched;
  const { sent, refound } = dispatched;
  const base = { action: bound.action, element, ...(refound ? { refound: true as const } : {}) };
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown', acted: true, effect: 'unknown', result: { verdict: 'unknown', ...base },
      why: { cause: 'effect_unknown', detail: sent.detail }, next: RE_OBSERVE,
    };
  }
  if (args.verify === null || before === null) {
    return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'done', ...base } };
  }
  return verifyAfter(ctx, page, { intent: args.verify, acted: element, before, piiMasks, value: policy.value, base });
}

/** `act --ticket T` (spec §6.2, §8.3): the ticket names the page; a different `--page` is a usage error. */
export async function runAct(args: ActArgs, ctx: CommandContext): Promise<Out> {
  const peeked = await peekTicketOnPage<ActCommandResult>(ctx, args.ticket, args.page);
  if (isOut(peeked)) return peeked;
  return actOnTicket(args, ctx, peeked.ticket, peeked.page);
}
