import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { boundText, cleanEgressText, sha256Hex } from '../../egress';
import { causeStatus, RE_OBSERVE, type Status } from '../../output';
import { fold } from '../../page-model';
import { BOUNDS, presenceSite } from '../../questions';
import { abstainOutcome, nothingDone, readPage, sleep, typedWithheld, urlGlobMatches, withoutTyped } from '../shared';
import type { AbstainWhy, PageReading } from '../shared';
import { formatDuration } from './duration';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

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

/**
 * What a presence Decision reads: the cleaned URL and body text, without what was typed into editable regions.
 * Cleaned before the site cuts it (spec §7.3).
 */
function presenceInput(args: WaitForArgs, reading: PageReading, piiMasks: boolean) {
  return {
    expectation: args.expect,
    pageUrl: boundText(cleanEgressText(reading.tab.url, piiMasks), { max: BOUNDS.URL_MAX, inline: true }),
    page: cleanEgressText(withoutTyped(reading.text, reading.typed), piiMasks),
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The wait (spec §6.2): each poll reads `tab show` + body text. Code says `present` when the literal or the URL
 * glob matches. Otherwise the presence Noul is asked, only when the cleaned text changed and at least one interval
 * passed since the last ask, and only when the whole round fits what is left of `--max-decisions` (an `agree`
 * round is two calls). It is never asked on a poll whose text is withheld (`typedWithheld`, noted): a wait only the
 * Decision could settle then ends `not_seen` by code. A timeout is `not_seen` (exit 10), never "absent".
 *
 * When the Decision cannot be asked (setup, caps, policy, a refused key), a wait that `--text` or `--url` can
 * settle keeps polling by code and names the cause in its notes; any other wait stops at once with that cause.
 * The same goes for `--max-decisions`: once no round fits what is left, a wait without a code rule ends there, as
 * `usage` when the cap is below a single round, since nothing else can ever see it.
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
  /** Why the Decision is no longer asked, once it is not; code keeps polling when `--text` or `--url` is set. */
  let closed: string | null = null;

  // A Decision that can never be asked on this wait: stop, unless code can still see it.
  const shut = (why: AbstainWhy): CommandOutcome<WaitForResult> | null => {
    if (!byCode) return abstainOutcome(why, result(null, 'decision'));
    closed = `the Decision is not asked: ${why.cause} (${why.detail})`;
    return null;
  };
  // Why no round of `calls` provider calls fits what is left of `--max-decisions`, or null while one does.
  const capped = (calls: number): string | null => {
    const left = args.maxDecisions - tally.decisions;
    if (left <= 0) return `the --max-decisions cap of ${args.maxDecisions} was reached`;
    if (calls > left) return `the --max-decisions cap of ${args.maxDecisions} was reached: a round takes ${calls} calls, ${left} left`;
    return null;
  };

  for (;;) {
    const reading = await readPage(ctx, page);
    tally.polls += 1;
    const rule = codePresence(args, reading);
    if (rule) {
      return { status: 'ok', acted: false, effect: 'none', result: { ...result('present', 'code'), rule }, settledByCode: true };
    }

    closed ??= capped(1);
    // A withheld text is no page to judge: this poll asks nothing and spends nothing, and a later readable poll may.
    const withheld = typedWithheld(reading.text, reading.typed) !== null;
    if (closed === null && !withheld && ctx.now() - lastAskAt >= args.intervalMs) {
      const input = presenceInput(args, reading, ctx.config.piiMasks);
      const hash = sha256Hex(`${input.pageUrl}\n${input.page}`);
      if (hash !== lastHash) {
        const route = await ctx.routeCheck(presenceSite, { combo, originUrl: reading.tab.url, dryRun: ctx.dryRun });
        const full = route.ok ? capped(route.calls) : null;
        if (!route.ok) {
          const stop = shut(route);
          if (stop) return stop;
        } else if (full !== null) {
          // Below one round, with nothing spent: without --text or --url this wait could only run out.
          if (!byCode && tally.decisions === 0) return belowOneRound(args.maxDecisions, route.calls);
          closed = full;
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
          closed ??= capped(route.calls);
        }
      }
    }

    // Without --text or --url only the Decision can see it: once it is closed, waiting on cannot change the answer.
    if (closed !== null && !byCode) return ended(args, ctx, { tally, byCode, closed, early: true, lastCause, result });
    const left = deadline - ctx.now();
    if (left <= 0 || ctx.signal.aborted) break;
    await sleep(Math.min(args.intervalMs, left), ctx.signal);
  }
  return ended(args, ctx, { tally, byCode, closed, early: false, lastCause, result });
}

/** `--max-decisions` is below one round and only the Decision could settle the wait: nothing was asked. */
function belowOneRound(cap: number, calls: number): CommandOutcome<WaitForResult> {
  return nothingDone<WaitForResult>('usage', 'usage', `--max-decisions ${cap} is below one Decision round of ${calls} `
    + `provider calls, and without --text or --url nothing else can see it: allow at least ${calls}, or add --text or --url`);
}

/**
 * The wait is over: it ran out, was interrupted, or (`early`) the Decision closed on a wait no code rule can settle.
 * `not_seen` (exit 10) when code looked all along or a provider answered; when the wait rested on the Decision and
 * no provider ever answered, it could not run: `unavailable` with the last provider cause.
 */
function ended(
  args: WaitForArgs,
  ctx: CommandContext,
  end: {
    tally: Tally; byCode: boolean; closed: string | null; early: boolean; lastCause: string | null;
    result: (verdict: WaitForResult['verdict'], by: WaitForResult['by']) => WaitForResult;
  },
): CommandOutcome<WaitForResult> {
  const { tally, lastCause } = end;
  const capped = tally.decisions >= args.maxDecisions ? `the --max-decisions cap of ${args.maxDecisions} was reached` : null;
  const closed = end.closed ?? capped;
  const notes = [plural(tally.polls, 'poll'), plural(tally.decisions, 'provider call')];
  if (closed !== null && !end.early) notes.push(closed);
  if (lastCause !== null && !(closed ?? '').includes(lastCause)) notes.push(`the last Decision: ${lastCause}`);
  let within = `within ${formatDuration(args.timeoutMs)}`;
  if (end.early && closed !== null) within = `before ${closed}`;
  else if (ctx.signal.aborted) within = 'before the wait was interrupted';
  if (!end.byCode && tally.answered === 0 && lastCause !== null && causeStatus(lastCause) === 'unavailable') {
    return {
      status: 'unavailable',
      acted: false,
      effect: 'none',
      result: end.result(null, 'decision'),
      why: { cause: lastCause, detail: `no provider answered ${within} (${notes.join('; ')})` },
      next: RE_OBSERVE,
    };
  }
  return {
    status: 'abstained',
    acted: false,
    effect: 'none',
    result: end.result('not_seen', tally.answered > 0 ? 'decision' : 'code'),
    why: { cause: 'not_seen', detail: `not seen ${within} (${notes.join('; ')})` },
    next: RE_OBSERVE,
  };
}
