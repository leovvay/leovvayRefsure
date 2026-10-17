import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { boundText, cleanEgressText, sha256Hex } from '../../egress';
import { causeStatus, type Status } from '../../output';
import { fold } from '../../page-model';
import { BOUNDS, presenceSite } from '../../questions';
import { abstainOutcome, readPage, sleep, typedWithheld, urlGlobMatches, withoutTyped } from '../shared';
import type { AbstainWhy, PageReading } from '../shared';
import { belowOneRound, ended, stalled } from './poll-end';
import type { PollTally } from './poll-tally';
import type { PollView } from './poll-view';
import type { WaitForArgs } from './wait-for.args';
import type { WaitForResult } from './wait-for.contract';

/** A Decision that cannot be asked will not become askable by waiting: setup, caps, policy. */
const STOPS: ReadonlySet<Status> = new Set<Status>(['not_set_up', 'spend_limit', 'refused']);
/** A provider that failed may answer on a later poll, even over the same text; a refused key never does. */
const RETRY: ReadonlySet<string> = new Set(['provider_timeout', 'provider_error']);
/**
 * After the Decision was unsure (its Noul inside the band, neither `present` nor a clear no), the stall window this
 * wait shrinks to: the page is not changing, so the text it read is all there is to read, and the caller can judge
 * that text itself. A clear no (at or under the band's low edge) keeps the whole window: the page may still be
 * loading.
 */
const LEAN_STALL_MS = 2_000;

/** Whether a Noul under the `present` edge is still above the band's low edge, the mirror of that edge. */
function unsure(confidence: number, threshold: number): boolean {
  return confidence > Math.round((1 - threshold) * 100) / 100;
}

/**
 * What the stall rule compares from poll to poll: the URL and the body text as read. It never leaves the machine,
 * so nothing is cut from it: a text withheld from the Decision still changes here as the page changes.
 */
function pageKey(whole: PageReading): string {
  return sha256Hex(`${whole.tab.url}\n${whole.text}`);
}

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

/**
 * The wait (spec §6.2): each poll reads `tab show` + body text, and judges what `view` keeps of it (the whole page
 * by default). Code says `present` when the literal or the URL glob matches. Otherwise the presence Noul is asked,
 * only when the cleaned text changed and at least one interval passed since the last ask, and only when the whole
 * round fits what is left of `--max-decisions` (an `agree` round is two calls). It is never asked on a poll whose
 * text is withheld (`typedWithheld`, noted): a wait only the Decision could settle then ends `not_seen` by code,
 * and says so when every poll was withheld, since nothing judged the page. A timeout is `not_seen` (exit 10), never
 * "absent".
 *
 * When the Decision cannot be asked (setup, caps, policy, a refused key), a wait that `--text` or `--url` can
 * settle keeps polling by code and names the cause in its notes; any other wait stops at once with that cause.
 * The same goes for `--max-decisions`: once no round fits what is left, a wait without a code rule ends there, as
 * `usage` when the cap is below a single round, since nothing else can ever see it.
 *
 * With `stallMs`, a poll that leaves the whole page (text and URL) as it has been for that long ends the wait
 * `stalled`, after that poll's own code rule and Decision had their turn. Once the Decision was unsure (`unsure`),
 * the window is `LEAN_STALL_MS` from that ask while the page stays as it read it, and the detail says so.
 */
export async function pollPresence(
  args: WaitForArgs, ctx: CommandContext, page: PageRef, view: PollView = (whole) => whole,
): Promise<CommandOutcome<WaitForResult>> {
  const tally: PollTally = { polls: 0, decisions: 0, answered: 0, withheld: 0, started: ctx.now() };
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
  let lastKey: string | null = null;
  let changedAt = tally.started;
  /** The last Decision that leaned to `present` under the edge, and the page it read. */
  let lean: { key: string; at: number; confidence: number; threshold: number } | null = null;

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
    const whole = await readPage(ctx, page);
    tally.polls += 1;
    const key = pageKey(whole);
    if (key !== lastKey) {
      lastKey = key;
      changedAt = ctx.now();
    }
    const reading = view(whole);
    const rule = reading === null ? null : codePresence(args, reading);
    if (rule) {
      return { status: 'ok', acted: false, effect: 'none', result: { ...result('present', 'code'), rule }, settledByCode: true };
    }

    closed ??= capped(1);
    // A withheld text is no page to judge: this poll asks nothing and spends nothing, and a later readable poll may.
    const withheld = reading !== null && typedWithheld(reading.text, reading.typed) !== null;
    if (withheld) tally.withheld += 1;
    if (reading !== null && closed === null && !withheld && ctx.now() - lastAskAt >= args.intervalMs) {
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
          const { confidence, threshold } = verdict;
          lean = verdict.cause === 'low_confidence' && confidence !== null && threshold !== null && unsure(confidence, threshold)
            ? { key, at: ctx.now(), confidence, threshold } : null;
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
    if (args.stallMs !== null && ctx.now() - changedAt >= args.stallMs) return stalled(args.stallMs, tally, result);
    if (args.stallMs !== null && lean !== null && lean.key === key && ctx.now() - lean.at >= Math.min(LEAN_STALL_MS, args.stallMs)) {
      return stalled(Math.min(LEAN_STALL_MS, args.stallMs), tally, result, lean);
    }
    const left = deadline - ctx.now();
    if (left <= 0 || ctx.signal.aborted) break;
    await sleep(Math.min(args.intervalMs, left), ctx.signal);
  }
  return ended(args, ctx, { tally, byCode, closed, early: false, lastCause, result });
}
