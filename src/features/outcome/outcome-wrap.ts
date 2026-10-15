import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { outcomeSite } from '../../questions';
import { abstainOutcome, readPage, sleep } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';
import { landedByCode } from './landed-by-code';
import { landedOutcome } from './landed-outcome';
import { checkBeforeAct } from './pre-act-checks';
import { cleanSide, outcomeSide } from './outcome-side';

/** How long the page gets to show the act's effect before the after-read (spec §6.2). */
const SETTLE_MS = 600;
const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
/** Under `--dry-run` nothing is acted on, so the after-side can only be a stand-in. */
const AFTER_UNREAD = `(the page as it reads ${SETTLE_MS} ms after the act; under --dry-run nothing is acted on or read)`;

function unknown(cause: string, detail: string): CommandOutcome<OutcomeResult> {
  return {
    status: 'effect_unknown',
    acted: true,
    effect: 'dispatched',
    result: { verdict: 'unknown', by: 'decision', unconfirmed: cause },
    why: { cause: 'effect_unknown', detail: `dispatched; not confirmed (${cause}): ${detail}` },
    next: RE_OBSERVE,
  };
}

/**
 * `outcome -- <verb> --element @eN`: the agent's own act, guarded (spec §6.2). Every refusal comes before the
 * dispatch; after it, only `landed` (exit 0) or `effect_unknown` (exit 30) is honest, never "failed".
 */
export async function runWrap(args: OutcomeWrapArgs, ctx: CommandContext): Promise<CommandOutcome<OutcomeResult>> {
  const page = ctx.page;
  if (page === null) throw new Error('outcome needs a page, and none was resolved');
  const tab = await ctx.browser.tabInfo(page);
  const checked = await checkBeforeAct(ctx, page, args, tab);
  if ('refusal' in checked) return checked.refusal;
  // Read before the dispatch: a config error after it could only say effect_unknown.
  const piiMasks = ctx.config.piiMasks;
  const before = { tab, text: checked.cleared.bodyText };
  if (ctx.dryRun) {
    // The body the outcome Decision would get (spec §6.3), its after-side a stand-in; `decide` throws `DryRunStop`.
    ctx.trace.notes.push('dry_run: the after side is a stand-in; it is read only after the act runs');
    const { verdict } = await ctx.decide(
      outcomeSite,
      {
        intent: args.intent,
        acted: checked.cleared.acted,
        before: outcomeSide(cleanSide(before, piiMasks)),
        after: outcomeSide({ url: '', title: '', text: AFTER_UNREAD }),
      },
      { combo: 'auto', originUrl: tab.url, dryRun: true, signal: ctx.signal },
    );
    if (verdict.kind === 'abstain') return abstainOutcome<OutcomeResult>(verdict, null);
  }

  const { action, ref, value } = args.act;
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
  const after = await readPage(ctx.browser, page);
  const rule = landedByCode(args, { url: before.tab.url, text: before.text }, { url: after.tab.url, text: after.text });
  if (rule) return landedOutcome('dispatched', 'code', rule);

  const { verdict } = await ctx.decide(
    outcomeSite,
    {
      intent: args.intent,
      acted: checked.cleared.acted,
      before: outcomeSide(cleanSide(before, piiMasks)),
      after: outcomeSide(cleanSide(after, piiMasks)),
    },
    { combo: 'auto', originUrl: after.tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
  );
  if (verdict.kind === 'answer') return landedOutcome('dispatched', 'decision');
  return unknown(verdict.cause, verdict.detail);
}
