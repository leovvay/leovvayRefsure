import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { outcomeSite } from '../../questions';
import { cleanSide, outcomeSide } from '../outcome';
import { type PageReading, readPage, sleep } from '../shared';
import type { ActCommandResult } from './act.contract';

/** How long the page gets to show the act's effect before the after-read (as `outcome` waits). */
const SETTLE_MS = 600;
const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
const AFTER_UNREAD = `(the page as it reads ${SETTLE_MS} ms after the act; under --dry-run nothing is acted on or read)`;

type Base = Pick<ActCommandResult, 'action' | 'element' | 'refound'>;

/** What `--verify` asks the outcome Noul: the intent, the element acted on, and both sides, cleaned for egress. */
function verifyInput(intent: string, acted: string, before: PageReading, after: PageReading | null, piiMasks: boolean) {
  return {
    intent,
    acted,
    before: outcomeSide(cleanSide(before, piiMasks)),
    after: after === null ? outcomeSide({ url: '', title: '', text: AFTER_UNREAD }) : outcomeSide(cleanSide(after, piiMasks)),
  };
}

/**
 * Under `--dry-run`, the body `--verify` would send, with a stand-in after-side; `decide` throws `DryRunStop`.
 * Returns only when the route refuses even a dry run (a provider not allowed, an origin denied).
 */
export async function dryVerify(
  ctx: CommandContext, intent: string, acted: string, before: PageReading, piiMasks: boolean,
) {
  return ctx.decide(outcomeSite, verifyInput(intent, acted, before, null, piiMasks),
    { combo: 'auto', originUrl: before.tab.url, dryRun: true, signal: ctx.signal });
}

/**
 * `--verify` after the act ran (spec §6.2): wait, read the page again, and ask the outcome Noul. Only `landed`
 * is exit 0; anything else, a provider failure included, is `effect_unknown` (exit 30), never "failed".
 */
export async function verifyAfter(
  ctx: CommandContext, page: PageRef, opts: { intent: string; acted: string; before: PageReading; piiMasks: boolean; base: Base },
): Promise<CommandOutcome<ActCommandResult>> {
  await sleep(SETTLE_MS, ctx.signal);
  const after = await readPage(ctx.browser, page);
  const { verdict } = await ctx.decide(outcomeSite, verifyInput(opts.intent, opts.acted, opts.before, after, opts.piiMasks),
    { combo: 'auto', originUrl: after.tab.url, dryRun: false, signal: ctx.signal });
  if (verdict.kind === 'answer') {
    return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'landed', ...opts.base } };
  }
  return {
    status: 'effect_unknown',
    acted: true,
    effect: 'dispatched',
    result: { verdict: 'unknown', ...opts.base, unconfirmed: verdict.cause },
    why: { cause: 'effect_unknown', detail: `dispatched; not confirmed (${verdict.cause}): ${verdict.detail}` },
    next: RE_OBSERVE,
  };
}
