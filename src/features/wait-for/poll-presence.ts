import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { boundText, cleanEgressText, sha256Hex } from '../../egress';
import { causeStatus, type Status } from '../../output';
import { fold } from '../../page-model';
import { BOUNDS, presenceSite } from '../../questions';
import { abstainOutcome, readPage, sleep, urlGlobMatches } from '../shared';
import type { PageReading } from '../shared';
import { formatDuration } from './duration';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

/** A Decision that cannot be asked will not become askable by waiting: setup, caps, policy. Stop at once. */
const STOPS: ReadonlySet<Status> = new Set<Status>(['not_set_up', 'spend_limit', 'refused']);
/** A provider that failed may answer on a later poll, even over the same text. */
const RETRY: ReadonlySet<string> = new Set(['provider_timeout', 'provider_error']);

type Tally = { polls: number; decisions: number; started: number };

function codePresence(args: WaitForArgs, reading: PageReading): WaitForResult['rule'] | null {
  if (args.text !== null && fold(reading.text).includes(fold(args.text))) return 'text';
  if (args.url !== null && urlGlobMatches(args.url, reading.tab.url)) return 'url';
  return null;
}

/** What a presence Decision reads: the cleaned URL and body text. Cleaned before the site cuts it (spec §7.3). */
function presenceInput(args: WaitForArgs, reading: PageReading, piiMasks: boolean) {
  return {
    expectation: args.expect,
    pageUrl: boundText(cleanEgressText(reading.tab.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true }),
    page: cleanEgressText(reading.text, piiMasks),
  };
}

/**
 * The wait (spec §6.2): each poll reads `tab show` + body text. Code says `present` when the literal or the URL
 * glob matches. Otherwise the presence Noul is asked, only when the cleaned text changed and at least one interval
 * passed since the last ask, while fewer than `--max-decisions` provider calls were made. A timeout is `not_seen`
 * (exit 10), never "absent".
 */
export async function pollPresence(args: WaitForArgs, ctx: CommandContext, page: PageRef): Promise<CommandOutcome<WaitForResult>> {
  const tally: Tally = { polls: 0, decisions: 0, started: ctx.now() };
  const deadline = tally.started + args.timeoutMs;
  const result = (verdict: WaitForResult['verdict'], by: WaitForResult['by']): WaitForResult => (
    { verdict, polls: tally.polls, decisions: tally.decisions, by, waited_ms: ctx.now() - tally.started }
  );
  let lastHash: string | null = null;
  let lastAskAt = Number.NEGATIVE_INFINITY;
  let lastCause: string | null = null;

  for (;;) {
    const reading = await readPage(ctx.browser, page);
    tally.polls += 1;
    const rule = codePresence(args, reading);
    if (rule) return { status: 'ok', acted: false, effect: 'none', result: { ...result('present', 'code'), rule } };

    if (tally.decisions < args.maxDecisions && ctx.now() - lastAskAt >= args.intervalMs) {
      const input = presenceInput(args, reading, ctx.config.piiMasks);
      const hash = sha256Hex(`${input.pageUrl}\n${input.page}`);
      if (hash !== lastHash) {
        lastHash = hash;
        lastAskAt = ctx.now();
        const calls = ctx.trace.egress.length;
        const { verdict } = await ctx.decide(presenceSite, input, {
          combo: args.agree ? 'agree' : 'auto', originUrl: reading.tab.url, dryRun: ctx.dryRun, signal: ctx.signal,
        });
        tally.decisions += ctx.trace.egress.length - calls;
        if (verdict.kind === 'answer') return { status: 'ok', acted: false, effect: 'none', result: result('present', 'decision') };
        if (STOPS.has(causeStatus(verdict.cause))) return abstainOutcome(verdict, result(null, 'decision'));
        lastCause = verdict.cause;
        if (RETRY.has(verdict.cause)) lastHash = null;
      }
    }

    const left = deadline - ctx.now();
    if (left <= 0 || ctx.signal.aborted) break;
    await sleep(Math.min(args.intervalMs, left), ctx.signal);
  }

  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  const notes = [plural(tally.polls, 'poll'), plural(tally.decisions, 'provider call')];
  if (tally.decisions >= args.maxDecisions) notes.push(`the --max-decisions cap of ${args.maxDecisions} was reached`);
  if (lastCause !== null) notes.push(`the last Decision: ${lastCause}`);
  const within = ctx.signal.aborted ? 'before the wait was interrupted' : `within ${formatDuration(args.timeoutMs)}`;
  return {
    status: 'abstained',
    acted: false,
    effect: 'none',
    result: result('not_seen', tally.decisions > 0 ? 'decision' : 'code'),
    why: { cause: 'not_seen', detail: `not seen ${within} (${notes.join('; ')})` },
    next: { do: 'snapshot', argv: ['refsure', 'snap'] },
  };
}
