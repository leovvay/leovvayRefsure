import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { boundText, cleanEgressText, sha256Hex } from '../../egress';
import { causeStatus, type Status } from '../../output';
import { fold } from '../../page-model';
import { BOUNDS, presenceSite } from '../../questions';
import type { Verdict } from '../../questions';
import { abstainOutcome, readPage, sleep, urlGlobMatches } from '../shared';
import type { PageReading } from '../shared';
import { formatDuration } from './duration';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

type Abstain = Extract<Verdict<unknown>, { kind: 'abstain' }>;

/** A Decision that cannot be asked will not become askable by waiting: setup, caps, policy. */
const STOPS: ReadonlySet<Status> = new Set<Status>(['not_set_up', 'spend_limit', 'refused']);
/** A provider that failed may answer on a later poll, even over the same text; a refused key never does. */
const RETRY: ReadonlySet<string> = new Set(['provider_timeout', 'provider_error']);

/** `decisions` counts provider calls; `answered`, Decisions a provider actually answered (present or not). */
type Tally = { polls: number; decisions: number; answered: number; started: number };

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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The wait (spec §6.2): each poll reads `tab show` + body text. Code says `present` when the literal or the URL
 * glob matches. Otherwise the presence Noul is asked, only when the cleaned text changed and at least one interval
 * passed since the last ask, and only when the whole round fits what is left of `--max-decisions` (an `agree`
 * round is two calls). A timeout is `not_seen` (exit 10), never "absent".
 *
 * When the Decision cannot be asked (setup, caps, policy, a refused key), a wait that `--text` or `--url` can
 * settle keeps polling by code and names the cause in its notes; any other wait stops at once with that cause.
 */
export async function pollPresence(args: WaitForArgs, ctx: CommandContext, page: PageRef): Promise<CommandOutcome<WaitForResult>> {
  const tally: Tally = { polls: 0, decisions: 0, answered: 0, started: ctx.now() };
  const deadline = tally.started + args.timeoutMs;
  const byCode = args.text !== null || args.url !== null;
  const combo = args.agree ? 'agree' : 'auto';
  const result = (verdict: WaitForResult['verdict'], by: WaitForResult['by']): WaitForResult => (
    { verdict, polls: tally.polls, decisions: tally.decisions, by, waited_ms: ctx.now() - tally.started }
  );
  let lastHash: string | null = null;
  let lastAskAt = Number.NEGATIVE_INFINITY;
  let lastCause: string | null = null;
  /** Why the Decision is no longer asked, once it is not; code keeps polling. */
  let closed: string | null = null;

  // A Decision that can never be asked on this wait: stop, unless code can still see it.
  const shut = (verdict: Abstain): CommandOutcome<WaitForResult> | null => {
    if (!byCode) return abstainOutcome(verdict, result(null, 'decision'));
    closed = `the Decision is not asked: ${verdict.cause} (${verdict.detail})`;
    return null;
  };

  for (;;) {
    const reading = await readPage(ctx.browser, page);
    tally.polls += 1;
    const rule = codePresence(args, reading);
    if (rule) {
      return { status: 'ok', acted: false, effect: 'none', result: { ...result('present', 'code'), rule }, settledByCode: true };
    }

    if (closed === null && tally.decisions >= args.maxDecisions) closed = `the --max-decisions cap of ${args.maxDecisions} was reached`;
    if (closed === null && ctx.now() - lastAskAt >= args.intervalMs) {
      const input = presenceInput(args, reading, ctx.config.piiMasks);
      const hash = sha256Hex(`${input.pageUrl}\n${input.page}`);
      if (hash !== lastHash) {
        const route = await ctx.routeCheck(presenceSite, { combo, originUrl: reading.tab.url, dryRun: ctx.dryRun });
        if (!route.ok) {
          const stop = shut({ kind: 'abstain', cause: route.cause, detail: route.detail, leaned: null, confidence: null, threshold: null });
          if (stop) return stop;
        } else if (tally.decisions + route.calls > args.maxDecisions) {
          const left = args.maxDecisions - tally.decisions;
          closed = `the --max-decisions cap of ${args.maxDecisions} was reached: a round takes ${route.calls} calls, ${left} left`;
        } else {
          lastHash = hash;
          lastAskAt = ctx.now();
          const calls = ctx.trace.egress.length;
          const { verdict } = await ctx.decide(presenceSite, input, {
            combo, originUrl: reading.tab.url, dryRun: ctx.dryRun, signal: ctx.signal,
          });
          tally.decisions += ctx.trace.egress.length - calls;
          if (verdict.kind === 'answer') return { status: 'ok', acted: false, effect: 'none', result: result('present', 'decision') };
          lastCause = verdict.cause;
          const status = causeStatus(verdict.cause);
          if (status === 'abstained') tally.answered += 1;
          if (STOPS.has(status) || verdict.permanent) {
            const stop = shut(verdict);
            if (stop) return stop;
          } else if (RETRY.has(verdict.cause)) lastHash = null;
        }
      }
    }

    const left = deadline - ctx.now();
    if (left <= 0 || ctx.signal.aborted) break;
    await sleep(Math.min(args.intervalMs, left), ctx.signal);
  }
  return timedOut(args, ctx, { tally, byCode, closed, lastCause, result });
}

/**
 * The wait ran out. `not_seen` (exit 10) when code looked all along or a provider answered; when the wait rested
 * on the Decision and no provider ever answered, it could not run: `unavailable` with the last provider cause.
 */
function timedOut(
  args: WaitForArgs,
  ctx: CommandContext,
  end: {
    tally: Tally; byCode: boolean; closed: string | null; lastCause: string | null;
    result: (verdict: WaitForResult['verdict'], by: WaitForResult['by']) => WaitForResult;
  },
): CommandOutcome<WaitForResult> {
  const { tally, lastCause } = end;
  const capped = tally.decisions >= args.maxDecisions ? `the --max-decisions cap of ${args.maxDecisions} was reached` : null;
  const closed = end.closed ?? capped;
  const notes = [plural(tally.polls, 'poll'), plural(tally.decisions, 'provider call')];
  if (closed !== null) notes.push(closed);
  if (lastCause !== null && !(closed ?? '').includes(lastCause)) notes.push(`the last Decision: ${lastCause}`);
  const within = ctx.signal.aborted ? 'before the wait was interrupted' : `within ${formatDuration(args.timeoutMs)}`;
  const next = { do: 'snapshot' as const, argv: ['refsure', 'snap'] };
  if (!end.byCode && tally.answered === 0 && lastCause !== null && causeStatus(lastCause) === 'unavailable') {
    return {
      status: 'unavailable',
      acted: false,
      effect: 'none',
      result: end.result(null, 'decision'),
      why: { cause: lastCause, detail: `no provider answered ${within} (${notes.join('; ')})` },
      next,
    };
  }
  return {
    status: 'abstained',
    acted: false,
    effect: 'none',
    result: end.result('not_seen', tally.answered > 0 ? 'decision' : 'code'),
    why: { cause: 'not_seen', detail: `not seen ${within} (${notes.join('; ')})` },
    next,
  };
}
