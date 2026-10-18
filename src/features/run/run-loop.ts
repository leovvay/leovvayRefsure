import { isBrowserError } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { contentWords, fold } from '../../page-model';
import { noRaiserNorEditableOnPage, noRaiserOnPage } from '../../risk';
import { type StepInput, type StepReading, stepSite } from '../../questions';
import { detectOverlay, dismissLevel } from '../dismiss';
import { abstainOutcome, baselineOf, sleep, valuesOf } from '../shared';
import { shortNumbers } from './element-table';
import type { TableHints } from './element-table-shape';
import type { RunArgs } from './run.args';
import type { RunResult } from './run.contract';
import { actStep, keepTyped, SETTLE_MS, stepActOf, unchangedStop } from './run-act-step';
import { abstainStop, ended, failedAfterAct, newFamilyStop } from './run-finish';
import { newTextOf, readingOf, stepInput } from './run-input';
import { look, lookOf } from './run-look';
import type { RunLook } from './run-look-shape';
import { changeWords, recentLine, resultOf, type RunState } from './run-state';
import type { RunStepReport } from './run-step-report';
import type { RunStop } from './run-stop';
import type { RaiserProbe } from './step-act-shape';
import { levelUnknownStop } from './run-blocker';
import { runTiming } from './run-timing';

type Out = CommandOutcome<RunResult>;

/** An unsure Decision: it read the page and found nothing it was sure of. */
const UNSURE: ReadonlySet<string> = new Set(['low_confidence', 'none_chosen']);
/**
 * How long an unsure Decision's page gets to show something else, looked at every `RELOOK_POLL_MS`, and how many
 * such waits one step may take.
 */
const RELOOK_MS = 1_000;
const RELOOK_POLL_MS = 250;
const RELOOKS_MAX = 2;
/**
 * WAIT looks again every `WAIT_POLL_MS` until the page shows something else, up to `WAIT_MS`: results that were
 * loading are read as soon as they show.
 */
const WAIT_MS = 800;
const WAIT_POLL_MS = 100;
const SCROLL_PX = 600;

/**
 * One step that sends nothing to an element: WAIT looks until the page changes (`WAIT_MS`), SCROLL_DOWN moves the
 * view and looks once. A scroll that showed nothing new counts toward `no_progress` as an act does (the end of the
 * page, a page already read whole); a wait that did not changes nothing there, since results may still be loading.
 */
async function idleStep(ctx: CommandContext, run: RunState, report: RunStepReport): Promise<RunStop | null> {
  const was = run.current;
  const before = was.sig;
  if (report.op === 'SCROLL_DOWN') {
    await ctx.browser.scrollDown!(run.page, SCROLL_PX);
    await sleep(SETTLE_MS, ctx.signal);
    run.current = await look(ctx, run.page, run.hints);
  } else {
    const until = ctx.now() + WAIT_MS;
    do {
      await sleep(WAIT_POLL_MS, ctx.signal);
      run.current = await look(ctx, run.page, run.hints);
    } while (run.current.sig === before && ctx.now() < until);
  }
  report.page_changed = run.current.sig !== before;
  const outcome = changeWords(report.page_changed);
  run.recent.push(recentLine(report, null, report.op === 'WAIT' ? `waited; ${outcome}` : outcome));
  keepTyped(run, was);
  if (report.op === 'SCROLL_DOWN') return unchangedStop(run, report.page_changed);
  if (report.page_changed) run.unchanged = 0;
  return null;
}

/**
 * After an unsure Decision: a look every `RELOOK_POLL_MS` until one shows another page, for up to `RELOOK_MS`.
 * That look, or null when the page stayed as the Decision read it.
 */
async function relook(ctx: CommandContext, run: RunState): Promise<RunLook | null> {
  const until = ctx.now() + RELOOK_MS;
  do {
    await sleep(Math.min(RELOOK_POLL_MS, Math.max(0, until - ctx.now())), ctx.signal);
    const again = await look(ctx, run.page, run.hints);
    if (again.sig !== run.current.sig) return again;
  } while (ctx.now() < until);
  return null;
}

/**
 * The raiser count (`noRaiserOnPage`) on the look a Decision is about to read, started now: the browser is idle
 * while the Decision is asked, and the guard reuses it when its fresh snapshot shows the same page. A failed count
 * reads as no proof, so the guard reads the raisers itself. When TYPE is offered, the count also looks for editable
 * regions (`noRaiserNorEditableOnPage`), so a fill on a page with none takes one call; one found sends the raiser
 * count on its own.
 */
function probeRaisers(ctx: CommandContext, run: RunState, input: StepInput): RaiserProbe {
  const alone = (): Promise<boolean> => noRaiserOnPage(ctx.browser, run.page).catch(() => false);
  const typing = input.open.some(Boolean) && input.rows.some((row) => row.typable);
  if (!typing) return { sig: run.current.sig, none: alone(), plain: Promise.resolve(false) };
  const plain = noRaiserNorEditableOnPage(ctx.browser, run.page).catch(() => false);
  return { sig: run.current.sig, none: plain.then((yes) => yes || alone()), plain };
}

/** The budget's end, when the step about to start would pass `--max-steps` or `--timeout`. */
function overBudget(run: RunState, now: number): RunStop | null {
  const { args } = run;
  if (run.steps.length >= args.maxSteps) {
    return { verdict: 'budget', cause: 'budget', detail: `ran ${args.maxSteps} steps (--max-steps) short of the goal` };
  }
  if (now - run.started < args.timeoutMs) return null;
  const seconds = Math.round((now - run.started) / 1000);
  return { verdict: 'budget', cause: 'budget', detail: `ran ${seconds} s (--timeout) short of the goal` };
}

/** How a reading that sends nothing ends the run: the done Noul's yes, DONE, BLOCKED; null for any other. */
function endOf(reading: StepReading, index: string | null, expect: string | null): RunStop | null {
  if (reading.done !== null && index === 'done') {
    return { verdict: 'seen', cause: 'seen', detail: `the done check said yes at ${reading.done}` };
  }
  if (reading.op === 'DONE') {
    const asked = expect === null
      ? 'nothing (--expect, --text) confirms it'
      : `the done check gave ${reading.done ?? 'no answer yet'}`;
    return { verdict: 'done_unconfirmed', cause: 'done_unconfirmed', detail: `the Decision said DONE at ${reading.p}; ${asked}` };
  }
  if (reading.op !== 'BLOCKED') return null;
  const detail = `the Decision said BLOCKED at ${reading.p}: no offered operation can make progress`;
  return { verdict: 'blocked', cause: 'blocked', detail };
}

/**
 * The loop (design 2026-10-17 §2): per step, the `--text` rule on the new text, the budget, one step Decision, then
 * at most one act. The done Noul at the presence edge ends it `seen` whatever leads; DONE without it ends it
 * `done_unconfirmed`, BLOCKED `blocked`. The look after an act is the next step's look. An unsure Decision gets
 * another look as soon as the page shows something else, within a second (twice at most per step), and is asked
 * again only then. A Decision the per-minute cap refused is asked again once the cap has room, within the budget.
 */
async function steps(ctx: CommandContext, run: RunState): Promise<RunStop> {
  const { args } = run;
  let relooks = 0;
  for (;;) {
    const at = ctx.now();
    run.timing.phase('decide');
    // The `--text` rule costs nothing and reads the last look too: an act that showed the goal ends the run `seen`
    // even when it was the budget's last.
    const newText = newTextOf(ctx, run);
    if (args.text !== null && newText !== '' && fold(newText).includes(fold(args.text))) {
      return { verdict: 'seen', cause: 'seen', detail: 'the --text literal is in the new text', byCode: true };
    }
    const budget = overBudget(run, at);
    if (budget !== null) return budget;
    const input = stepInput(ctx, run, newText);
    run.probe = probeRaisers(ctx, run, input);
    const decided = await ctx.decide(stepSite, input, {
      risk: 'write', combo: 'jev', originUrl: run.current.tab.url, dryRun: ctx.dryRun, signal: ctx.signal,
    });
    const { verdict } = decided;
    if (verdict.kind === 'abstain') {
      const retryIn = verdict.cause === 'spend_limit' ? verdict.retryInMs : undefined;
      if (retryIn !== undefined && ctx.now() + retryIn - run.started < args.timeoutMs) {
        // The per-minute cap: wait for its room (the look is taken again, the page moved meanwhile).
        await sleep(retryIn, ctx.signal);
        run.current = await look(ctx, run.page, run.hints);
        continue;
      }
      // Unsure on a page still moving (results loading, a menu closing, prices filling in): another look as soon as
      // the page shows something else, and a Decision only then. Asked again on the same page, it would only be
      // asked until it said yes.
      if (relooks >= RELOOKS_MAX || !UNSURE.has(verdict.cause)) return abstainStop(verdict);
      relooks += 1;
      run.timing.phase('relook');
      const again = await relook(ctx, run);
      if (again === null) return abstainStop(verdict);
      run.current = again;
      continue;
    }
    relooks = 0;
    if (decided.newFamily) return newFamilyStop(ctx.trace.decisions.at(-1)?.model);
    const reading = verdict.value;
    if (reading.led !== undefined) run.timing.note(reading.led);
    run.timing.note(`provider ${ctx.trace.decisions.at(-1)?.ms ?? '?'} ms`);
    const end = endOf(reading, verdict.index, args.expect);
    if (end !== null) return end;
    const report: RunStepReport = {
      n: run.steps.length + 1, op: reading.op, element: null, p: verdict.confidence, page_changed: null, ms: 0,
    };
    run.steps.push(report);
    if (reading.op === 'WAIT' || reading.op === 'SCROLL_DOWN') {
      run.timing.phase('idle');
      const stop = await idleStep(ctx, run, report);
      report.ms = ctx.now() - at;
      run.timing.flush(report.n, report.op);
      if (stop !== null) return stop;
      continue;
    }
    const act = stepActOf(run, reading);
    if (act === null) {
      report.verdict = 'stopped';
      const detail = `the ${reading.op} target names no element of the table`;
      return { verdict: 'decision_unavailable', cause: 'provider_error', detail };
    }
    const stop = await actStep(ctx, run, reading, act, report);
    report.ms = ctx.now() - at;
    run.timing.flush(report.n, report.op);
    if (stop !== null) return stop;
  }
}

/**
 * `run` (design 2026-10-17): the first look, the step route checked before anything acts, one blocker level, the
 * baseline of new text, then the steps. Under `--dry-run` it stops at the first Decision request. A browser
 * failure after an act keeps the steps so far (exit 30).
 */
export async function runRun(args: RunArgs, given: CommandContext): Promise<Out> {
  const timing = runTiming(given.env);
  // Timed, the port is wrapped; the rest of the context is read through (its config loads on first read).
  const timed = timing.wrap(given.browser);
  const ctx: CommandContext = timed === given.browser
    ? given
    : Object.create(given, { browser: { value: timed } }) as CommandContext;
  const page = ctx.page;
  if (page === null) throw new Error('run needs a page, and none was resolved');
  // What the page wrote: its text, its elements, and the address it ended on (its path and query are the page's).
  const untrusted = ['result.steps', 'result.dismissed', 'result.blockers', 'result.new_text', 'result.url', 'why.detail'];
  for (const path of untrusted) ctx.trace.untrusted.add(path);
  const started = ctx.now();
  const asked = [args.goal, ...args.fills.map((fill) => fill.value)].join(' ');
  const hints: TableHints = {
    words: contentWords(asked), numbers: shortNumbers(asked), fills: args.fills, kinds: new Map(),
  };
  const first = await look(ctx, page, hints);
  // The blocker level may click before the first step Decision: the step route is checked first, so no refusal
  // follows a click.
  const route = await ctx.routeCheck(stepSite, { combo: 'jev', originUrl: first.tab.url, dryRun: ctx.dryRun });
  if (!route.ok) return abstainOutcome<RunResult>(route, null);
  const run: RunState = {
    args, page, hints, values: valuesOf(args.fills.map((fill) => ({ action: 'fill', value: fill.value }))),
    baseline: new Set(), started, steps: [], recent: [], acted: false, unchanged: 0, repeats: new Map(), typed: null,
    typedAt: new Map(), seenIn: new Map(), dismissed: null, blockers: [], tried: new Set(), current: first, probe: null,
    shown: [], timing,
  };
  const result = (): RunResult => resultOf(run, ctx.now(), ctx.trace.decisions.length);
  try {
    if (args.dismiss) {
      const level = detectOverlay(first.tree) === null
        ? null
        : await dismissLevel(ctx, page, { propose: false, agree: false, depth: 1 }, 1, first);
      run.dismissed = level?.report ?? { level: 1, verdict: 'no_overlay' };
      if (run.dismissed.overlay !== undefined) run.tried.add(run.dismissed.overlay);
      if (level?.status === 'effect_unknown') return ended(levelUnknownStop(level), true, result());
      if (level?.clicked) {
        run.acted = true;
        run.current = level.tree ? lookOf(await ctx.browser.tabInfo(page), level.tree, hints) : await look(ctx, page, hints);
      }
    }
    // New text is what the steps bring: the page as the blocker level left it is the baseline.
    run.baseline = baselineOf(readingOf(run.current));
    const stop = await steps(ctx, run);
    return ended(stop, run.acted, result());
  } catch (error) {
    if (!(run.acted || ctx.trace.dispatched) || !isBrowserError(error)) throw error;
    const at = run.steps.at(-1);
    if (at !== undefined && at.verdict === undefined && at.page_changed === null) at.verdict = 'stopped';
    return failedAfterAct(error, result());
  }
}
