import type { CommandContext, CommandOutcome } from '../../cli';
import { cleanEgressText } from '../../egress';
import { causeStatus, type Next } from '../../output';
import { outcomeSite } from '../../questions';
import { markOnPage, markView } from '../mark';
import { abstainOutcome, readPage } from '../shared';
import type { OutcomeMarkArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';
import { landedByCode } from './landed-by-code';
import { landedOutcome } from './landed-outcome';
import { outcomeSide } from './outcome-side';

const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
const MARK_HINT = 'take a new one (refsure mark) before your next act';

/**
 * `outcome --mark M` (spec §6.2): did the intent land since the mark, after the agent acted itself? Reads only.
 * Both sides are cleaned alike (query-less URL; URL and text redacted and masked) before the code rules or the
 * Decision see them, so `--expect-url` matches the URL without its query. An unconfirmed answer is `effect_unknown` (exit 30),
 * never `abstained`: the agent did act, and only a fresh look can say what happened.
 */
export async function runMark(args: OutcomeMarkArgs, ctx: CommandContext): Promise<CommandOutcome<OutcomeResult>> {
  const page = ctx.page;
  if (page === null) throw new Error('outcome needs a page, and none was resolved');
  const mark = await markOnPage<OutcomeResult>(ctx, args.mark, page.id, MARK_HINT);
  if ('status' in mark) return mark;

  const reading = await readPage(ctx.browser, page);
  const now = markView(reading);
  // A needle past the mark's cut reads as absent before while it was there all along: only the Decision can say.
  if (args.expectText !== null && mark.textCut) {
    ctx.trace.notes.push('--expect-text: the mark kept only the start of a long page, so the Decision judges it');
  }
  const expectText = args.expectText === null || mark.textCut ? null : cleanEgressText(args.expectText, true);
  const rule = landedByCode({ ...args, expectText }, { url: mark.url, text: mark.text }, { url: now.url, text: now.text });
  if (rule) return landedOutcome('none', 'code', rule);

  const { verdict } = await ctx.decide(
    outcomeSite,
    { intent: args.intent, before: outcomeSide(mark), after: outcomeSide(now) },
    { combo: 'auto', originUrl: reading.tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
  );
  if (verdict.kind === 'answer') return landedOutcome('none', 'decision');
  // A Decision that could not be asked (setup, caps, policy, provider down) is that cause's own status.
  if (causeStatus(verdict.cause) !== 'abstained') {
    return abstainOutcome<OutcomeResult>(verdict, null);
  }
  return {
    status: 'effect_unknown',
    acted: false,
    effect: 'none',
    result: { verdict: 'unknown', by: 'decision', unconfirmed: verdict.cause },
    why: { cause: 'effect_unknown', detail: `not confirmed (${verdict.cause}): ${verdict.detail}` },
    next: RE_OBSERVE,
  };
}
