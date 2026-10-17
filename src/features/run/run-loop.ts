import { isBrowserError } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { contentWords, fold } from '../../page-model';
import { type StepReading, stepSite } from '../../questions';
import { detectOverlay, dismissLevel } from '../dismiss';
import { abstainOutcome, baselineOf, sleep, valuesOf } from '../shared';
import { shortNumbers } from './element-table';
import type { TableHints } from './element-table-shape';
import type { RunArgs } from './run.args';
import type { RunResult } from './run.contract';
import { actStep, SETTLE_MS, stepActOf } from './run-act-step';
import { abstainStop, ended, failedAfterAct, newFamilyStop } from './run-finish';
import { newTextOf, readingOf, stepInput } from './run-input';
import { look, lookOf } from './run-look';
import { changeWords, recentLine, resultOf, type RunState } from './run-state';
import type { RunStepReport } from './run-step-report';
import type { RunStop } from './run-stop';

type Out = CommandOutcome<RunResult>;

/** An unsure Decision: it read the page and found nothing it was sure of. */
const UNSURE: ReadonlySet<string> = new Set(['low_confidence', 'none_chosen']);
/** How long an unsure Decision's page gets before one more look, and how many such looks one step may take. */
const RELOOK_MS = 1_000;
const RELOOKS_MAX = 2;
/** WAIT sleeps this long before the next look. */
const WAIT_MS = 400;
const SCROLL_PX = 600;

/** One step that sends nothing to an element: WAIT sleeps, SCROLL_DOWN moves the view; then the next look. */
async function idleStep(ctx: CommandContext, run: RunState, report: RunStepReport): Promise<void> {
  const before = run.current.sig;
  if (report.op === 'SCROLL_DOWN') {
    await ctx.browser.scrollDown!(run.page, SCROLL_PX);
    await sleep(SETTLE_MS, ctx.signal);
  } else {
    await sleep(WAIT_MS, ctx.signal);
  }
  run.current = await look(ctx, run.page, run.hints);
  report.page_changed = run.current.sig !== before;
  const outcome = changeWords(report.page_changed);
  run.recent.push(recentLine(report, null, report.op === 'WAIT' ? `waited; ${outcome}` : outcome));
  run.typed = null;
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
 * The loop (design 2026-10-17 §2): per step, the budget, the `--text` rule on the new text, one step Decision, then
 * at most one act. The done Noul at the presence edge ends it `seen` whatever leads; DONE without it ends it
 * `done_unconfirmed`, BLOCKED `blocked`. The look after an act is the next step's look. An unsure Decision gets
 * another look a second later (twice at most per step), and is asked again only when the page has changed since.
 */
async function steps(ctx: CommandContext, run: RunState): Promise<RunStop> {
  const { args } = run;
  let relooks = 0;
  for (;;) {
    const at = ctx.now();
    const budget = overBudget(run, at);
    if (budget !== null) return budget;
    const newText = newTextOf(ctx, run);
    if (args.text !== null && newText !== '' && fold(newText).includes(fold(args.text))) {
      return { verdict: 'seen', cause: 'seen', detail: 'the --text literal is in the new text', byCode: true };
    }
    const decided = await ctx.decide(stepSite, stepInput(ctx, run, newText), {
      risk: 'write', combo: 'jev', originUrl: run.current.tab.url, dryRun: ctx.dryRun, signal: ctx.signal,
    });
    const { verdict } = decided;
    if (verdict.kind === 'abstain') {
      // Unsure on a page still moving (results loading, a menu closing, prices filling in): one more look a second
      // later, and a Decision only when the page now shows something else. Asked again on the same page, it would
      // only be asked until it said yes.
      if (relooks >= RELOOKS_MAX || !UNSURE.has(verdict.cause)) return abstainStop(verdict);
      relooks += 1;
      await sleep(RELOOK_MS, ctx.signal);
      const again = await look(ctx, run.page, run.hints);
      if (again.sig === run.current.sig) return abstainStop(verdict);
      run.current = again;
      continue;
    }
    relooks = 0;
    if (decided.newFamily) return newFamilyStop(ctx.trace.decisions.at(-1)?.model);
    const reading = verdict.value;
    const end = endOf(reading, verdict.index, args.expect);
    if (end !== null) return end;
    const report: RunStepReport = {
      n: run.steps.length + 1, op: reading.op, element: null, p: verdict.confidence, page_changed: null, ms: 0,
    };
    run.steps.push(report);
    if (reading.op === 'WAIT' || reading.op === 'SCROLL_DOWN') {
      await idleStep(ctx, run, report);
      report.ms = ctx.now() - at;
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
    if (stop !== null) return stop;
  }
}

/**
 * `run` (design 2026-10-17): the first look, the step route checked before anything acts, one blocker level, the
 * baseline of new text, then the steps. Under `--dry-run` it stops at the first Decision request. A browser
 * failure after an act keeps the steps so far (exit 30).
 */
export async function runRun(args: RunArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('run needs a page, and none was resolved');
  for (const path of ['result.steps', 'result.dismissed', 'result.new_text', 'why.detail']) ctx.trace.untrusted.add(path);
  const started = ctx.now();
  const asked = [args.goal, ...args.fills.map((fill) => fill.value)].join(' ');
  const hints: TableHints = { words: contentWords(asked), numbers: shortNumbers(asked), fills: args.fills };
  const first = await look(ctx, page, hints);
  // The blocker level may click before the first step Decision: the step route is checked first, so no refusal
  // follows a click.
  const route = await ctx.routeCheck(stepSite, { combo: 'jev', originUrl: first.tab.url, dryRun: ctx.dryRun });
  if (!route.ok) return abstainOutcome<RunResult>(route, null);
  const run: RunState = {
    args, page, hints, values: valuesOf(args.fills.map((fill) => ({ action: 'fill', value: fill.value }))),
    baseline: new Set(), started, steps: [], recent: [], acted: false, unchanged: 0, repeats: new Map(), typed: null,
    typedAt: new Map(), seenIn: new Map(), dismissed: null, current: first, shown: [],
  };
  const result = (): RunResult => resultOf(run, ctx.now(), ctx.trace.decisions.length);
  try {
    if (args.dismiss) {
      const level = detectOverlay(first.tree) === null
        ? null
        : await dismissLevel(ctx, page, { propose: false, agree: false, depth: 1 }, 1, first);
      run.dismissed = level?.report ?? { level: 1, verdict: 'no_overlay' };
      if (level?.status === 'effect_unknown') {
        const stop: RunStop = {
          verdict: 'stopped', cause: level.why?.cause ?? 'effect_unknown',
          detail: level.why?.detail ?? 'the blocker click may have landed', effect: level.effect ?? 'dispatched',
        };
        if (level.next) stop.next = level.next;
        return ended(stop, true, result());
      }
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
