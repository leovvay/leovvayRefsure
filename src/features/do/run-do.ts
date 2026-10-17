import { isBrowserError, type PageRef, type TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { DryRunStop } from '../../output';
import { presenceSite } from '../../questions';
import { detectOverlay, dismissLevel, type LevelOutcome } from '../dismiss';
import type { LocateScene } from '../locate';
import { SETTLE_MS } from '../outcome';
import { abstainOutcome, type PageReading, readPage, sleep, typedWithheld, withheldNote } from '../shared';
import { pollPresence, type WaitForArgs } from '../wait-for';
import type { DoArgs } from './do.args';
import type { DoResult } from './do.contract';
import type { DoStepReport } from './do-step-report';
import { blockerUnknown, failedAfterAct, stepStopped, waited } from './do-finish';
import { locateAll, lookAt } from './do-locate';
import { runSteps } from './do-steps';
import { baselineOf, newReading, shownLines, valuesOf } from './new-text';

type Out = CommandOutcome<DoResult>;

/** The wait polls once a second; a Decision is asked at most once per poll, and only on new text that changed. */
const POLL_MS = 1_000;
/** The most provider calls one Decision round takes: an `agree` asks both providers. */
const ROUND_CALLS_MAX = 2;
/** Why no Decision saw a new text that a value this run filled, too short to cut out, shows in as a word. */
const SHORT_VALUE = 'a value this run filled, too short to cut out (one or two characters), shows in the new text as a word';

/**
 * The wait's call cap: one round per poll, every poll of the timeout and the first. A page whose text keeps moving
 * (a progress count) asks on every poll, and still only `--timeout` or the stall ends the wait, never this cap.
 */
function decisionsCap(timeoutMs: number): number {
  return (Math.ceil(timeoutMs / POLL_MS) + 1) * ROUND_CALLS_MAX;
}

/**
 * The presence Decision is asked after the acts, so its route (keys, consent, provider, origin, caps) is checked
 * before any: a refusal never comes after a click. `--text` can settle the wait by code, so it needs no route.
 */
async function waitRouteRefusal(ctx: CommandContext, args: DoArgs, tab: TabInfo): Promise<Out | null> {
  if (args.expect === null || args.text !== null) return null;
  const route = await ctx.routeCheck(presenceSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
  return route.ok ? null : abstainOutcome<DoResult>(route, null);
}

/**
 * One dismiss level (spec §2.1 step 2), through dismiss's own code: Decision, veto, guarded click, overlay-gone
 * check. With no overlay by code on the first look, no level runs and that look stays the one the steps use.
 */
async function blockers(ctx: CommandContext, page: PageRef, first: LocateScene): Promise<LevelOutcome | null> {
  if (detectOverlay(first.tree) === null) return null;
  return dismissLevel(ctx, page, { propose: false, agree: false, depth: 1 }, 1);
}

/**
 * After the steps (spec §2.1 step 5), and `SETTLE_MS` after the last act: with `--expect`, `wait-for`'s poll judging
 * only the new text, with the stall rule; without it, one read. `new_text` is the last poll's. A browser failure after
 * an act keeps all of it (`failedAfterAct`).
 */
async function finish(ctx: CommandContext, page: PageRef, args: DoArgs, before: PageReading, acted: boolean, result: DoResult): Promise<Out> {
  const baseline = baselineOf(before);
  const values = valuesOf(args.steps);
  const seen: { last: PageReading | null } = { last: null };
  const view = (whole: PageReading): PageReading | null => {
    seen.last = newReading(whole, baseline, values);
    // Withheld for the run's own short value, not the page's typing, which `readPage` notes itself.
    const byValue = seen.last !== null && typedWithheld(whole.text, whole.typed) === null
      && typedWithheld(seen.last.text, seen.last.typed) !== null;
    if (byValue) {
      const note = withheldNote(SHORT_VALUE);
      if (!ctx.trace.notes.includes(note)) ctx.trace.notes.push(note);
    }
    return seen.last;
  };
  const started = ctx.now();
  const sofar = (polls: number): DoResult => ({
    ...result, new_text: shownLines(seen.last), polls, waited_ms: ctx.now() - started, decisions: ctx.trace.egress.length,
  });
  try {
    // The page gets `SETTLE_MS` to show the acts' effect before the first look, as `outcome` and `act --verify` give
    // it: a Decision on a page caught mid-update is spent on nothing. A read meanwhile judges nothing; it only lets
    // the baseline forget a line the page took down mid-update ("Profile saved" while "Saving…"), so it is new again.
    if (acted) {
      const [early] = await Promise.all([readPage(ctx, page), sleep(SETTLE_MS, ctx.signal)]);
      newReading(early, baseline, values);
    }
    if (args.expect === null) {
      view(await readPage(ctx, page));
      return { status: 'ok', acted, effect: acted ? 'dispatched' : 'none', result: { ...sofar(1), verdict: 'done' } };
    }
    const wait: WaitForArgs = {
      expect: args.expect, text: args.text, url: null, timeoutMs: args.timeoutMs, intervalMs: POLL_MS,
      maxDecisions: decisionsCap(args.timeoutMs), agree: false, stallMs: args.stallMs,
    };
    const poll = await pollPresence(wait, ctx, page, view);
    return waited(poll, acted, sofar(poll.result?.polls ?? 0));
  } catch (error) {
    if (!acted || !isBrowserError(error)) throw error;
    return failedAfterAct(error, sofar(0));
  }
}

/**
 * `do` (spec §2.1): the baseline read and the first look at once; the presence route; one blocker level; every
 * step's pick on one look, in parallel; the acts in order through `act`'s ticket path; then the wait on new text.
 * Under `--dry-run` it stops at the first Decision request, else before the first act or the wait.
 */
export async function runDo(args: DoArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('do needs a page, and none was resolved');
  for (const path of ['result.steps', 'result.dismissed', 'result.new_text', 'why.detail']) ctx.trace.untrusted.add(path);
  const [before, first] = await Promise.all([readPage(ctx, page), lookAt(ctx, page)]);
  const refusal = await waitRouteRefusal(ctx, args, before.tab);
  if (refusal !== null) return refusal;
  const reports: DoStepReport[] = args.steps.map((step) => ({
    step: step.action, target: step.target, element: null, by: null, verdict: 'not_run',
  }));
  const result: DoResult = { verdict: 'done', steps: reports, dismissed: null, new_text: [], waited_ms: 0, polls: 0, decisions: 0 };

  let acted = false;
  let stepping = false;
  try {
    let scene = first;
    if (args.dismiss) {
      const level = await blockers(ctx, page, first);
      result.dismissed = level?.report ?? { level: 1, verdict: 'no_overlay' };
      if (level?.status === 'effect_unknown') return blockerUnknown(level, { ...result, decisions: ctx.trace.egress.length });
      acted = level?.clicked ?? false;
      // The level read its own snapshot, which may renumber refs, and a click changed the page: look again.
      if (level !== null) scene = await lookAt(ctx, page);
    }
    const located = args.steps.length === 0 ? [] : await locateAll(ctx, scene, args.steps);
    // Every pick was settled by code, or there was none: a dry run ends here, before any act or wait.
    if (ctx.dryRun) throw new DryRunStop();
    if (args.steps.length > 0) {
      stepping = true;
      const run = await runSteps(ctx, page, args.steps, located, reports);
      acted ||= run.acted;
      if (run.stop !== null) return stepStopped(run.stop, args.steps, acted, { ...result, decisions: ctx.trace.egress.length });
    }
  } catch (error) {
    // A browser call failed once something acted: the steps so far are kept, and the step it failed at is marked.
    if (!(acted || ctx.trace.dispatched) || !isBrowserError(error)) throw error;
    const at = stepping ? reports.find((report) => report.verdict === 'not_run') : undefined;
    if (at) at.verdict = 'stopped';
    return failedAfterAct(error, { ...result, decisions: ctx.trace.egress.length });
  }
  return finish(ctx, page, args, before, acted, result);
}
