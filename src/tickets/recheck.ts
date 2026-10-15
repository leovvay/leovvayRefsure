import type { ActAction, PageRef } from '../browser';
import type { CommandContext } from '../cli';
import { findByFingerprint, fold, rowTextOf, urlNorm } from '../page-model';
import { classify, fieldRaisers, maxRisk, pageRaisers } from '../risk';
import type { RiskClass, RiskReading } from '../risk';
import type { RecheckResult } from './recheck-result';
import type { Ticket } from './ticket';

const FIELD_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select', 'check', 'uncheck']);

/**
 * Steps 2-6 of the ticket path (spec §8.3): the same URL, a fresh snapshot, the fingerprint's twin group unchanged,
 * the ref at the stored ordinal (still in the `--within` row when one was bound), and the risk re-read on the
 * fresh tree. A stored ref number is never reused.
 * Browser failures propagate for the registry to map. `action` defaults to the ticket's, then `click`.
 */
export async function recheck(
  ctx: CommandContext, ticket: Ticket, opts: { action?: ActAction } = {},
): Promise<RecheckResult> {
  const page: PageRef = { backend: ctx.browser.backend, id: ticket.pageId };
  const tab = await ctx.browser.tabInfo(page);
  if (urlNorm(tab.url) !== ticket.urlNorm) return { stale: 'page_changed' };
  const tree = await ctx.browser.snapshot(page);
  ctx.trace.snapshotTaken = true;
  const found = findByFingerprint(tree, ticket.fingerprint);
  if (found === 'gone') return { stale: 'ref_gone' };
  if (found === 'changed') return { stale: 'page_changed' };
  // The same ordinal in another row is another element: `--within` bound the row, and it must still hold.
  if (ticket.within !== undefined && !fold(rowTextOf(tree, found.node)).includes(ticket.within)) {
    return { stale: 'page_changed' };
  }
  const action = opts.action ?? ticket.action ?? 'click';
  const readings: RiskReading[] = [classify(tree, found.node, { url: tab.url, action })];
  if (action === 'click' || action === 'dblclick') readings.push(await pageRaisers(ctx.browser, page, action));
  if (FIELD_ACTIONS.has(action)) readings.push(await fieldRaisers(ctx.browser, page, found.ref));
  return { ref: found.ref, risk: rise(ticket.risk, readings) };
}

/** Risk only rises (spec §8.1 invariant 4): the class the ticket was issued at outlives a calmer fresh read. */
function rise(issued: RiskClass, readings: RiskReading[]): RiskReading {
  const fresh = maxRisk(...readings.map((r) => r.class));
  const reasons = [...new Set(readings.flatMap((r) => r.reasons))];
  const risk = maxRisk(issued, fresh);
  if (risk !== fresh) reasons.push(`ticket:${issued}`);
  return { class: risk, reasons };
}
