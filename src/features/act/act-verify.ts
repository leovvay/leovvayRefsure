import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { outcomeSite } from '../../questions';
import { outcomeInput, SETTLE_MS, unconfirmed } from '../outcome';
import { type PageReading, readPage, sleep } from '../shared';
import type { ActCommandResult } from './act.contract';

type Base = Pick<ActCommandResult, 'action' | 'element' | 'refound'>;

/** What `--verify` asks with: the intent, the element acted on, the before-side, and the value a fill typed. */
type VerifyOpts = { intent: string; acted: string; before: PageReading; piiMasks: boolean; value: string | undefined };

/**
 * Under `--dry-run`, the body `--verify` would send, with a stand-in after-side; `decide` throws `DryRunStop`.
 * Returns only when the route refuses even a dry run (a provider not allowed, an origin denied).
 */
export async function dryVerify(ctx: CommandContext, opts: VerifyOpts) {
  return ctx.decide(outcomeSite, outcomeInput(opts.intent, opts.acted, opts.before, null, opts),
    { combo: 'auto', originUrl: opts.before.tab.url, dryRun: true, signal: ctx.signal });
}

/**
 * `--verify` after the act ran (spec §6.2): wait as `outcome` does, read the page again, and ask the outcome Noul.
 * Only `landed` is exit 0; anything else, a provider failure included, is `effect_unknown` (exit 30), never "failed".
 */
export async function verifyAfter(
  ctx: CommandContext, page: PageRef, opts: VerifyOpts & { base: Base },
): Promise<CommandOutcome<ActCommandResult>> {
  await sleep(SETTLE_MS, ctx.signal);
  const after = await readPage(ctx.browser, page);
  const { verdict } = await ctx.decide(outcomeSite, outcomeInput(opts.intent, opts.acted, opts.before, after, opts),
    { combo: 'auto', originUrl: after.tab.url, dryRun: false, signal: ctx.signal });
  if (verdict.kind === 'answer') {
    return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'landed', ...opts.base } };
  }
  return unconfirmed({ verdict: 'unknown', ...opts.base, unconfirmed: verdict.cause }, verdict);
}
