import { type ActResult, type AxTree, isBrowserError, type PageRef, type Ref } from '../../browser';
import type { CommandContext } from '../../cli';
import { candidateKey, type Fingerprint } from '../../page-model';
import type { StepReading } from '../../questions';
import { sleep } from '../shared';
import { guardStep } from './run-guard';
import { look } from './run-look';
import type { RunLook } from './run-look-shape';
import { changeWords, recentLine, type RunState } from './run-state';
import type { RunStepReport } from './run-step-report';
import type { RunStop } from './run-stop';
import type { StepAct } from './step-act-shape';

/** The page gets this long to show an act's effect before the next look. */
export const SETTLE_MS = 250;
/**
 * A click in a dialog or on an option often closes it, and a click on a field often opens a picker; either
 * animates, and a picker may fill in later (a calendar's prices). A look caught mid-way finds elements that move
 * before the next act (a stale step, a Decision spent on nothing), so such a click settles this long.
 */
const DIALOG_SETTLE_MS = 500;
/** The fields and options whose click settles `DIALOG_SETTLE_MS`. */
const SLOW_ROLES: ReadonlySet<string> = new Set([
  'textbox', 'searchbox', 'combobox', 'option', 'menuitem', 'menuitemradio',
]);
/** After typing into a combobox, the look is taken again until its options show, up to this long after the act. */
const OPTIONS_MS = 600;
/** The same act on the same element a third time ends the run: twice is a retry, three times a loop. */
const REPEAT_MAX = 2;
/** Acts in a row that changed nothing end the run. */
const UNCHANGED_MAX = 3;

/** One element by its fingerprint: role, name, path and ordinal in a twin group of the same size. */
export function sameElement(a: Fingerprint, b: Fingerprint): boolean {
  return a.role === b.role && a.name === b.name && a.path === b.path && a.ordinal === b.ordinal && a.twins === b.twins;
}

/** The element and value a reading's target names on the look it read; null when the table has no such row. */
export function stepActOf(run: RunState, reading: StepReading): StepAct | null {
  const { table } = run.current;
  const target = reading.target;
  if (reading.op === 'PRESS_ENTER') {
    const typed = run.typed;
    const entry = typed === null ? undefined : [...table.byN.values()].find((e) => sameElement(e.cand.fp, typed));
    return entry === undefined ? null : { op: 'PRESS_ENTER', cand: entry.cand, p: reading.p, inDialog: entry.overlay };
  }
  const entry = target === null ? undefined : table.byN.get(target.n);
  if (target === null || entry === undefined) return null;
  if (target.op === 'TYPE') {
    const fill = run.args.fills[target.fill];
    if (fill === undefined) return null;
    return { op: 'TYPE', cand: entry.cand, value: fill.value, p: target.p, inDialog: entry.overlay };
  }
  if (target.op === 'SELECT') {
    const label = entry.options[target.option];
    if (label === undefined) return null;
    return { op: 'SELECT', cand: entry.cand, value: label, p: target.p, inDialog: entry.overlay };
  }
  return { op: 'CLICK', cand: entry.cand, p: target.p, inDialog: entry.overlay };
}

/** What the envelope names as the value: a TYPE's `--fill` key (never the value), a SELECT's option label. */
function valueShown(run: RunState, act: StepAct, reading: StepReading): string | undefined {
  if (act.op === 'TYPE' && reading.target?.op === 'TYPE') return run.args.fills[reading.target.fill]?.key;
  if (act.op === 'SELECT') return `option ${JSON.stringify(act.value ?? '')}`;
  return undefined;
}

function send(ctx: CommandContext, page: PageRef, ref: Ref, act: StepAct): Promise<ActResult> {
  if (act.op === 'PRESS_ENTER') return ctx.browser.pressEnter!(page);
  const action = act.op === 'CLICK' ? 'click' : act.op === 'TYPE' ? 'fill' : 'select';
  return ctx.browser.act(page, ref, action, act.value);
}

function optionCount(tree: AxTree): number {
  return tree.nodes.filter((node) => node.role === 'option').length;
}

/**
 * The look after an act, `SETTLE_MS` after it (`DIALOG_SETTLE_MS` after a click in a dialog, on a field or an
 * option): a page caught mid-navigation may refuse one snapshot, so a slow or failing read is tried once more. After
 * a TYPE into a combobox, the look is taken again (once) until its options show, up to `OPTIONS_MS` after the act.
 */
async function lookAfter(
  ctx: CommandContext, run: RunState, act: StepAct, before: RunLook, sentAt: number,
): Promise<RunLook> {
  const slow = act.op === 'CLICK' && (act.inDialog || SLOW_ROLES.has(act.cand.fp.role));
  await sleep(slow ? DIALOG_SETTLE_MS : SETTLE_MS, ctx.signal);
  let next: RunLook;
  try {
    next = await look(ctx, run.page, run.hints);
  } catch (error) {
    if (!isBrowserError(error) || (error.code !== 'timeout' && error.code !== 'backend_error')) throw error;
    await sleep(SETTLE_MS, ctx.signal);
    next = await look(ctx, run.page, run.hints);
  }
  const combobox = act.op === 'TYPE' && act.cand.fp.role === 'combobox';
  const waitOptions = combobox && optionCount(next.tree) <= optionCount(before.tree);
  const left = OPTIONS_MS - (ctx.now() - sentAt);
  if (waitOptions && left > 0) {
    await sleep(left, ctx.signal);
    next = await look(ctx, run.page, run.hints);
  }
  return next;
}

/**
 * One act of `run` (design 2026-10-17 §2.5-2.8): the repeat rule, the guard on a fresh snapshot, the act at once on
 * the fresh ref, then the look after it, which is the next step's look. A stale element sends nothing: the step is
 * recorded, and the page, which was still moving, gets `SETTLE_MS` before the next look (the recheck's snapshot is
 * that look when it already shows another URL). A third same act, a guard stop, an act that may not have
 * landed, or three acts in a row that changed nothing end the run. A sent act is never sent again by this code.
 */
export async function actStep(
  ctx: CommandContext, run: RunState, reading: StepReading, act: StepAct, report: RunStepReport,
): Promise<RunStop | null> {
  const { cand } = act;
  const element = { role: cand.fp.role, name: cand.fp.name };
  report.element = cand.line;
  const shown = valueShown(run, act, reading);
  if (shown !== undefined) report.value = shown;
  const key = `${act.op}\n${candidateKey(cand)}\n${cand.fp.ordinal}\n${act.value ?? ''}`;
  const sentBefore = run.repeats.get(key) ?? 0;
  if (sentBefore >= REPEAT_MAX) {
    report.verdict = 'stopped';
    return {
      verdict: 'no_progress', cause: 'no_progress',
      detail: `the Decision chose ${act.op} on ${JSON.stringify(cand.fp.name)} a third time; nothing more was sent`,
    };
  }
  const guarded = await guardStep(ctx, run.page, run.current, act, run.hints);
  if (guarded.kind === 'stale') {
    report.verdict = 'stale';
    run.recent.push(recentLine(report, element, `${guarded.detail}; nothing was sent`));
    run.typed = null;
    // The page was still moving: give it a moment, unless the recheck already caught it on another page.
    if (guarded.cause === 'page_changed' && guarded.fresh.tab.url !== run.current.tab.url) {
      run.current = guarded.fresh;
    } else {
      await sleep(SETTLE_MS, ctx.signal);
      run.current = await look(ctx, run.page, run.hints);
    }
    return null;
  }
  if (guarded.kind === 'stop') {
    report.verdict = 'stopped';
    if (guarded.risk !== undefined) report.risk = guarded.risk;
    const stop: RunStop = {
      verdict: guarded.cause === 'low_confidence' ? 'low_confidence' : 'refused', cause: guarded.cause,
      detail: guarded.detail, status: guarded.status,
    };
    if (guarded.next) stop.next = guarded.next;
    return stop;
  }
  report.risk = guarded.risk.class;
  const sentAt = ctx.now();
  const sent = await send(ctx, run.page, guarded.ref, act);
  if (sent.kind === 'stale_ref') {
    report.verdict = 'stale';
    run.recent.push(recentLine(report, element, 'the element left the page before the act; nothing was sent'));
    run.current = await look(ctx, run.page, run.hints);
    run.typed = null;
    return null;
  }
  run.repeats.set(key, sentBefore + 1);
  run.acted = true;
  if (sent.kind === 'unknown') {
    report.verdict = 'unknown';
    return { verdict: 'stopped', cause: 'effect_unknown', detail: sent.detail, effect: 'unknown' };
  }
  const next = await lookAfter(ctx, run, act, guarded.fresh, sentAt);
  report.page_changed = next.sig !== guarded.fresh.sig;
  run.recent.push(recentLine(report, element, changeWords(report.page_changed)));
  run.unchanged = report.page_changed ? 0 : run.unchanged + 1;
  run.typed = act.op === 'TYPE' ? cand.fp : null;
  if (act.op === 'TYPE' && reading.target?.op === 'TYPE') run.typedAt.set(reading.target.fill, report.n);
  run.current = next;
  if (run.unchanged >= UNCHANGED_MAX) {
    return {
      verdict: 'no_progress', cause: 'no_progress',
      detail: `${UNCHANGED_MAX} acts in a row changed nothing on the page. Orca delivers clicks and keys only while its `
        + 'browser tab is on screen: bring the tab to the front, then look again',
    };
  }
  return null;
}
