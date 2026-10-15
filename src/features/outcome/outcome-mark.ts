import type { CommandContext, CommandOutcome } from '../../cli';
import { cleanEgressText } from '../../egress';
import { causeStatus, type Next } from '../../output';
import { outcomeSite } from '../../questions';
import { loadMark, markView } from '../mark';
import { abstainOutcome, readPage } from '../shared';
import type { OutcomeMarkArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';
import { landedByCode } from './landed-by-code';
import { outcomeSide } from './outcome-side';

const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

function nothing(status: 'stale' | 'usage', cause: string, detail: string): CommandOutcome<OutcomeResult> {
  const outcome: CommandOutcome<OutcomeResult> = { status, acted: false, effect: 'none', result: null, why: { cause, detail } };
  if (status === 'stale') outcome.next = RE_OBSERVE;
  return outcome;
}

function landed(by: OutcomeResult['by'], rule?: OutcomeResult['rule']): CommandOutcome<OutcomeResult> {
  const result: OutcomeResult = { verdict: 'landed', by };
  if (rule) result.rule = rule;
  const outcome: CommandOutcome<OutcomeResult> = { status: 'ok', acted: false, effect: 'none', result };
  if (by === 'code') outcome.settledByCode = true;
  return outcome;
}

/**
 * `outcome --mark M` (spec §6.2): did the intent land since the mark, after the agent acted itself? Reads only.
 * Both sides are cleaned alike (query-less URL; text redacted and masked) before the code rules or the Decision see
 * them, so `--expect-url` matches the URL without its query. An unconfirmed answer is `effect_unknown` (exit 30),
 * never `abstained`: the agent did act, and only a fresh look can say what happened.
 */
export async function runMark(args: OutcomeMarkArgs, ctx: CommandContext): Promise<CommandOutcome<OutcomeResult>> {
  const page = ctx.page;
  if (page === null) throw new Error('outcome needs a page, and none was resolved');
  const mark = await loadMark(ctx.store, args.mark, ctx.now());
  if (mark === 'missing') return nothing('stale', 'ticket_expired', `no mark ${args.mark} is kept; marks live 15 minutes`);
  if (mark === 'expired') return nothing('stale', 'ticket_expired', `mark ${args.mark} has expired; take a new one`);
  if (mark.pageId !== page.id) {
    return nothing('usage', 'usage', `mark ${args.mark} was taken on page ${mark.pageId}, not ${page.id}: pass --page ${mark.pageId}`);
  }

  const reading = await readPage(ctx.browser, page);
  const now = markView(reading);
  const check = { ...args, expectText: args.expectText === null ? null : cleanEgressText(args.expectText, true) };
  const rule = landedByCode(check, { url: mark.url, text: mark.text }, { url: now.url, text: now.text });
  if (rule) return landed('code', rule);

  const { verdict } = await ctx.decide(
    outcomeSite,
    { intent: args.intent, before: outcomeSide(mark), after: outcomeSide(now) },
    { combo: 'auto', originUrl: reading.tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
  );
  if (verdict.kind === 'answer') return landed('decision');
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
