import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { urlNorm } from '../../page-model';
import { outcomeSite } from '../../questions';
import { abstainOutcome, nothingDone, readPage, sleep } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';
import { landedByCode } from './landed-by-code';
import { landedOutcome } from './landed-outcome';
import { checkBeforeAct, nameStill } from './pre-act-checks';
import { outcomeInput, SETTLE_MS, unconfirmed, unjudged, withheldUnmoved } from './outcome-side';

/**
 * `outcome -- <verb> --element @eN`: the agent's own act, guarded (spec §6.2). Every refusal comes before the
 * dispatch; after it, only `landed` (exit 0) or `effect_unknown` (exit 30) is honest, never "failed". The before-read
 * comes after every check. It lies between the guard and the dispatch, so after it the URL and tab are compared
 * again and the ref's name and risk read again (`nameStill`). One window stays open: a confirm dialog that opens
 * while the before-read runs is not seen, since the risk was read before it.
 */
export async function runWrap(args: OutcomeWrapArgs, ctx: CommandContext): Promise<CommandOutcome<OutcomeResult>> {
  const page = ctx.page;
  if (page === null) throw new Error('outcome needs a page, and none was resolved');
  const tab = await ctx.browser.tabInfo(page);
  const checked = await checkBeforeAct(ctx, page, args, tab);
  if ('refusal' in checked) return checked.refusal;
  const { action, ref, value } = args.act;
  const before = await readPage(ctx, page);
  // The route, origin and risk were read on the URL the checks saw: a page that moved on since is not the one judged.
  if (urlNorm(before.tab.url) !== urlNorm(tab.url) || (before.tab.tabKey ?? undefined) !== (tab.tabKey ?? undefined)) {
    return nothingDone('stale', 'page_changed', 'the page moved to another URL or tab while the act was checked; '
      + 'nothing was done', { next: RE_OBSERVE });
  }
  // The same URL can still have renamed the ref while the before-read ran.
  const renamed = await nameStill(ctx, page, args, checked.cleared);
  if (renamed !== null) return renamed;
  // Read before the dispatch: a config error after it could only say effect_unknown.
  const sides = { piiMasks: ctx.config.piiMasks, value };
  if (ctx.dryRun) {
    // The body the outcome Decision would get (spec §6.3), its after-side a stand-in; `decide` throws `DryRunStop`.
    ctx.trace.notes.push('dry_run: the after side is a stand-in; it is read only after the act runs');
    const { verdict } = await ctx.decide(outcomeSite, outcomeInput(args.intent, checked.cleared.acted, before, null, sides),
      { combo: 'auto', originUrl: before.tab.url, dryRun: true, signal: ctx.signal });
    if (verdict.kind === 'abstain') return abstainOutcome<OutcomeResult>(verdict, null);
  }

  const sent = await ctx.browser.act(page, ref, action, value);
  if (sent.kind === 'stale_ref') {
    return {
      status: 'stale',
      acted: false,
      effect: 'none',
      result: null,
      why: { cause: 'ref_gone', detail: `@${ref} is gone from the page; nothing was dispatched` },
      next: RE_OBSERVE,
    };
  }
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown',
      acted: true,
      effect: 'unknown',
      result: { verdict: 'unknown', by: 'code' },
      why: { cause: 'effect_unknown', detail: sent.detail },
      next: RE_OBSERVE,
    };
  }

  await sleep(SETTLE_MS, ctx.signal);
  const after = await readPage(ctx, page);
  const rule = landedByCode(args, { url: before.tab.url, text: before.text }, { url: after.tab.url, text: after.text });
  if (rule) return landedOutcome('dispatched', 'code', rule);
  if (withheldUnmoved(before, after, sides)) return unjudged<OutcomeResult>({ verdict: 'unknown', by: 'code' }, true);

  const { verdict } = await ctx.decide(outcomeSite, outcomeInput(args.intent, checked.cleared.acted, before, after, sides),
    { combo: 'auto', originUrl: after.tab.url, dryRun: ctx.dryRun, signal: ctx.signal });
  if (verdict.kind === 'answer') return landedOutcome('dispatched', 'decision');
  return unconfirmed({ verdict: 'unknown', by: 'decision', unconfirmed: verdict.cause }, verdict);
}
