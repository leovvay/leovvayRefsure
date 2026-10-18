import { type ActBinding, type ActResult, type AxTree, isBrowserError, type PageRef, type Ref } from '../../browser';
import type { CommandContext } from '../../cli';
import {
  bindingTo, candidateKey, DIALOG_ROLES, type Fingerprint, findByFingerprint, isValueField, norm, rowTextOf,
} from '../../page-model';
import type { StepReading } from '../../questions';
import { vetoOf } from '../dismiss';
import { sleep } from '../shared';
import { holds } from './element-table';
import { overlayOf, vetoedInOverlay } from './run-blocker';
import type { TableEntry } from './element-table-shape';
import { guardStep, inFrame } from './run-guard';
import { look } from './run-look';
import type { RunLook } from './run-look-shape';
import { offScreenStop, settleFor, settleNote } from './run-settle';
import { changeWords, recentLine, type RunState } from './run-state';
import type { RunStepReport } from './run-step-report';
import type { RunStop } from './run-stop';
import type { StepAct } from './step-act-shape';

/**
 * After an act the page gets until it has rendered a frame and its animations have stopped (`settleFor`), at most
 * this long, before the look after it; a look that follows a stale step or a scroll gets `AGAIN_MS`.
 */
const AFTER_ACT_MS = 1_200;
export const AGAIN_MS = 600;
/** While a look after the settle still shows the page as it was before the act, another is taken, this long. */
const CHANGE_MS = 600;
/**
 * After typing into a combobox its suggestions come from the network: looks are taken from the settle on while the
 * options are those shown before the act (none yet, or the list the typing has not narrowed yet), up to
 * `OPTIONS_MS` after it. A changed list ends the wait at once when an option names the typed value; otherwise only
 * from a look started `OPTIONS_WAIT_MS` after the settle, since focus alone may show a list the typing has yet to
 * replace.
 */
const OPTIONS_WAIT_MS = 250;
const OPTIONS_MS = 700;
/**
 * A look after an act that fails as a page caught mid-navigation fails (`timeout`, `backend_error`) is taken again
 * every `RETRY_POLL_MS`, at least once and until this long after the settle.
 */
const RETRY_MS = 1_000;
const RETRY_POLL_MS = 100;
/** The roles whose click opens or closes a list or a dialog. */
const OPENERS: ReadonlySet<string> = new Set(['combobox', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox']);
/** The same act on the same element on the same page a third time ends the run: twice is a retry, three a loop. */
const REPEAT_MAX = 2;
/** Acts or scrolls in a row that changed nothing end the run. */
const UNCHANGED_MAX = 3;

/** One element by its fingerprint: role, name, path and ordinal in a twin group of the same size. */
export function sameElement(a: Fingerprint, b: Fingerprint): boolean {
  return a.role === b.role && a.name === b.name && a.path === b.path && a.ordinal === b.ordinal && a.twins === b.twins;
}

/** Where a row's element sits: its dialog, and for one with identical twins the row the table told it apart by. */
function placeOf(look: RunLook, entry: TableEntry): Pick<StepAct, 'inDialog' | 'row'> {
  const { cand } = entry;
  return cand.fp.twins > 1 ? { inDialog: entry.overlay, row: rowTextOf(look.tree, cand.node) } : { inDialog: entry.overlay };
}

/** The element and value a reading's target names on the look it read; null when the table has no such row. */
export function stepActOf(run: RunState, reading: StepReading): StepAct | null {
  const { table } = run.current;
  const target = reading.target;
  if (reading.op === 'PRESS_ENTER') {
    const typed = run.typed;
    const entry = typed === null ? undefined : [...table.byN.values()].find((e) => sameElement(e.cand.fp, typed));
    return entry === undefined ? null : { op: 'PRESS_ENTER', cand: entry.cand, p: reading.p, ...placeOf(run.current, entry) };
  }
  const entry = target === null ? undefined : table.byN.get(target.n);
  if (target === null || entry === undefined) return null;
  const place = placeOf(run.current, entry);
  if (target.op === 'TYPE') {
    const fill = run.args.fills[target.fill];
    if (fill === undefined) return null;
    return { op: 'TYPE', cand: entry.cand, value: fill.value, p: target.p, ...place };
  }
  if (target.op === 'SELECT') {
    const label = entry.options[target.option];
    if (label === undefined) return null;
    return { op: 'SELECT', cand: entry.cand, value: label, p: target.p, ...place };
  }
  return { op: 'CLICK', cand: entry.cand, p: target.p, ...place };
}

/** What the envelope names as the value: a TYPE's `--fill` key (never the value), a SELECT's option label. */
function valueShown(run: RunState, act: StepAct, reading: StepReading): string | undefined {
  if (act.op === 'TYPE' && reading.target?.op === 'TYPE') return run.args.fills[reading.target.fill]?.key;
  if (act.op === 'SELECT') return `option ${JSON.stringify(act.value ?? '')}`;
  return undefined;
}

/**
 * The act on the fresh ref; a fill takes the one-call path on a page the probe found no editable region in. A click
 * carries `bind`, the name the guard read, so Orca may click at the element's point through its own mouse.
 */
function send(
  ctx: CommandContext, page: PageRef, ref: Ref, act: StepAct, plain: boolean, bind?: ActBinding,
): Promise<ActResult> {
  if (act.op === 'PRESS_ENTER') return ctx.browser.pressEnter!(page, ref);
  if (act.op === 'TYPE' && plain && ctx.browser.fillInput !== undefined) {
    return ctx.browser.fillInput(page, ref, act.value!);
  }
  if (act.op === 'CLICK') return ctx.browser.act(page, ref, 'click', undefined, bind);
  return ctx.browser.act(page, ref, act.op === 'TYPE' ? 'fill' : 'select', act.value);
}

/**
 * Whether the field takes the one-call fill (`fillInput`): the count taken while the Decision was asked found no
 * editable region (and no raiser, and no input that takes no typed text) on this same page, the field sits in no
 * frame (a count reads the top document only), and the fresh tree does not mark it editable. An editable region
 * would take agent-browser's fill as added text, not a replacement; one in a shadow root escapes the count, so
 * `addedTo` checks the field after the act.
 */
async function plainField(run: RunState, act: StepAct, fresh: RunLook, node: number): Promise<boolean> {
  const probe = run.probe;
  if (act.op !== 'TYPE' || probe === null || probe.sig !== fresh.sig || inFrame(fresh.tree, node)) return false;
  if (fresh.tree.nodes[node]?.attrs.contenteditable === true) return false;
  return probe.plain;
}

/**
 * After a one-call fill, whether the field shows its old text with the value added to it rather than replaced by
 * it (agent-browser's fill in an editable region the count could not see): it held text the value does not hold,
 * and now shows both. Null when it did not; else the stop, since that text is written and nothing here undoes it.
 */
function addedTo(act: StepAct, fresh: RunLook, node: number, next: RunLook): RunStop | null {
  const before = norm(fresh.tree.nodes[node]?.value ?? '');
  const value = norm(act.value ?? '');
  const found = findByFingerprint(next.tree, act.cand.fp);
  const after = typeof found === 'object' ? norm(next.tree.nodes[found.node]?.value ?? '') : '';
  const fold = (text: string): string => text.toLowerCase();
  if (before === '' || value === '' || fold(value).includes(fold(before))) return null;
  if (after === value || !fold(after).includes(fold(before)) || !fold(after).includes(fold(value))) return null;
  return {
    verdict: 'stopped', cause: 'effect_unknown', effect: 'unknown',
    detail: `the field ${JSON.stringify(act.cand.fp.name)} shows its earlier text with the value added to it, not `
      + 'replaced by it: an editable region the page count could not see. Check the field before going on',
  };
}

/**
 * The dialogs a look shows, by role and name, in page order: a dialog opening or closing animates. A tooltip popup
 * (Ryanair's airport list and calendar) opens and closes as a dialog does.
 */
function dialogsShown(tree: AxTree): string {
  return tree.nodes.filter((node) => DIALOG_ROLES.has(node.role) || node.role === 'tooltip')
    .map((node) => `${node.role} ${node.name}`).join('\n');
}

/** The options a look shows, by name, in page order: one string, so two looks compare at once. */
function optionsShown(tree: AxTree): string {
  return tree.nodes.filter((node) => node.role === 'option').map((node) => node.name).join('\n');
}

/**
 * One look after an act, taken again while it fails as a page caught mid-navigation fails it: at least once, and
 * until `RETRY_MS` after `from` (the settle's end). Then the failure stands.
 */
async function lookOnce(ctx: CommandContext, run: RunState, from: number): Promise<RunLook> {
  for (let tried = 0; ; tried += 1) {
    try {
      return await look(ctx, run.page, run.hints);
    } catch (error) {
      if (!isBrowserError(error) || (error.code !== 'timeout' && error.code !== 'backend_error')) throw error;
      if (tried > 0 && ctx.now() - from >= RETRY_MS) throw error;
      await sleep(RETRY_POLL_MS, ctx.signal);
    }
  }
}

/** Whether one of the options a look shows names `value` (`holds`): the typing has narrowed the list. */
function optionNamed(tree: AxTree, value: string): boolean {
  return tree.nodes.some((node) => node.role === 'option' && holds(node.name, value));
}

/**
 * The look after an act, once the page has settled (`settleFor`, up to `AFTER_ACT_MS`), taken again while it shows
 * the page as it was before the act, up to `CHANGE_MS` after the settle (an act that changed nothing costs those
 * looks; one that did shows on the first look, often). After an act that opens or closes something (a click on one
 * of `OPENERS` or in a dialog, Enter, or any act after which a dialog or a tooltip came or went), one more look is
 * taken: at once after a quiet settle, after another settle when the first hit its cap or could not run. After a
 * TYPE into a combobox, looks are taken while its options are still those shown before it, up to `OPTIONS_MS`, and
 * while an early list names no typed value (`OPTIONS_WAIT_MS`); suggestions come from the network, not from frames.
 */
async function lookAfter(ctx: CommandContext, run: RunState, act: StepAct, before: RunLook): Promise<RunLook> {
  const settled = await settleFor(ctx, run.page, run.settling, AFTER_ACT_MS);
  run.timing.note(settleNote(settled));
  run.timing.phase('look');
  const from = ctx.now();
  let lookedAt = from;
  let next = await lookOnce(ctx, run, from);
  const since = (): number => ctx.now() - from;
  if (act.op === 'TYPE' && act.cand.fp.role === 'combobox') {
    const shown = optionsShown(before.tree);
    const ready = (): boolean => optionsShown(next.tree) !== shown
      && (lookedAt - from >= OPTIONS_WAIT_MS || optionNamed(next.tree, act.value ?? ''));
    while (!ready() && since() < OPTIONS_MS) {
      lookedAt = ctx.now();
      next = await lookOnce(ctx, run, from);
    }
    return next;
  }
  while (next.sig === before.sig && since() < CHANGE_MS) next = await lookOnce(ctx, run, from);
  const animates = act.op === 'PRESS_ENTER' || (act.op === 'CLICK' && (act.inDialog || OPENERS.has(act.cand.fp.role)));
  if (next.sig === before.sig || !(animates || dialogsShown(next.tree) !== dialogsShown(before.tree))) return next;
  // One more look: the first after such an act often catches it mid-way (on Google Flights, about half the clicks
  // on an option then went stale), and the one after it showed the elements a third look did.
  if (settled === null || !settled.quiet) await settleFor(ctx, run.page, run.settling, AGAIN_MS);
  return lookOnce(ctx, run, ctx.now());
}

/**
 * One act of `run` (design 2026-10-17 §2.5-2.8): the repeat rule, the guard on a fresh snapshot, the act at once on
 * the fresh ref, then the look after it, which is the next step's look. A stale element sends nothing: the step is
 * recorded, and the page, which was still moving, settles before the next look (`AGAIN_MS`; the recheck's snapshot is
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
  // Nothing goes to a tab that renders no frames: it would take no input, or take it later on another page.
  run.timing.phase('frame');
  const dark = await offScreenStop(ctx, run.page, run.settling);
  if (dark !== null) {
    report.verdict = 'stopped';
    return dark;
  }
  // A pick run never clicks (an Accept), inside an overlay that showed after step 1: a blocker level on the overlay
  // instead, once per overlay. The guard's own veto still stands for every other pick.
  const veto = act.op === 'CLICK' ? vetoOf(run.current.tree.nodes[cand.node]?.name ?? cand.fp.name) : null;
  if (veto !== null && overlayOf(run, run.current, cand.node)) return vetoedInOverlay(ctx, run, report, element, veto.term);
  // The same act on the same page: a Next or a + clicked on as the page moves on is a new act each time, and a page
  // that comes back to where it was (a picker opened and closed) is a loop.
  const key = `${act.op}\n${candidateKey(cand)}\n${cand.fp.ordinal}\n${act.value ?? ''}\n${run.current.sig}`;
  const sentBefore = run.repeats.get(key) ?? 0;
  if (sentBefore >= REPEAT_MAX) {
    report.verdict = 'stopped';
    return {
      verdict: 'no_progress', cause: 'no_progress',
      detail: `the Decision chose ${act.op} on ${JSON.stringify(cand.fp.name)} a third time on the same page; nothing `
        + 'more was sent',
    };
  }
  run.timing.phase('recheck');
  const guarded = await guardStep(ctx, run.page, run.current, act, run.hints, run.probe, run.timing);
  if (guarded.kind === 'stale') {
    report.verdict = 'stale';
    run.timing.note(`stale: ${guarded.cause}${guarded.fresh.tab.url === run.current.tab.url ? '' : ', url'}`);
    run.recent.push(recentLine(report, element, `${guarded.detail}; nothing was sent`));
    // The page was still moving: give it a moment, unless the recheck already caught it on another page. Nothing
    // was sent, so a field just typed into may still take Enter, on the page it was typed on (`keepTyped`).
    const was = run.current;
    if (guarded.cause === 'page_changed' && guarded.fresh.tab.url !== was.tab.url) {
      run.current = guarded.fresh;
    } else {
      await settleFor(ctx, run.page, run.settling, AGAIN_MS);
      run.current = await look(ctx, run.page, run.hints);
    }
    keepTyped(run, was);
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
  const plain = await plainField(run, act, guarded.fresh, guarded.node);
  run.timing.phase('act');
  // A second try of the same act on the same page clicks through agent-browser, which moves the mouse first: a control
  // that wants a hover gets it. It is a new step from a new Decision, never a resend of the first.
  const bind = act.op === 'CLICK' && sentBefore === 0 ? bindingTo(guarded.fresh.tree.nodes[guarded.node]!.name) : undefined;
  const sent = await send(ctx, run.page, guarded.ref, act, plain, bind);
  if (sent.via !== undefined) run.timing.note(sent.via);
  if (sent.kind === 'stale_ref') {
    // Covered: the element is there, under another one (a dialog, a banner); the next step sees it in `recent` and
    // in the table. The same pick a third time on this page stops as a repeat, though nothing was sent.
    report.verdict = sent.covered === undefined ? 'stale' : 'covered';
    if (sent.covered !== undefined) run.repeats.set(key, sentBefore + 1);
    run.recent.push(recentLine(report, element, sent.covered === undefined
      ? 'the element left the page before the act; nothing was sent'
      : 'another element covers it at its click point; nothing was sent'));
    const was = run.current;
    run.current = await look(ctx, run.page, run.hints);
    keepTyped(run, was);
    return null;
  }
  run.repeats.set(key, sentBefore + 1);
  run.acted = true;
  if (sent.kind === 'unknown') {
    report.verdict = 'unknown';
    return { verdict: 'stopped', cause: 'effect_unknown', detail: sent.detail, effect: 'unknown' };
  }
  run.timing.phase('settle');
  const next = await lookAfter(ctx, run, act, guarded.fresh);
  report.page_changed = next.sig !== guarded.fresh.sig;
  const added = plain ? addedTo(act, guarded.fresh, guarded.node, next) : null;
  if (added !== null) {
    report.verdict = 'unknown';
    run.current = next;
    return added;
  }
  const outcome = `${changeWords(report.page_changed)}${typedWords(act, guarded.fresh, next)}${emptiedWords(act, next)}`;
  run.recent.push(recentLine(report, element, outcome));
  run.typed = act.op === 'TYPE' ? cand.fp : null;
  if (act.op === 'TYPE' && reading.target?.op === 'TYPE') run.typedAt.set(reading.target.fill, report.n);
  run.current = next;
  return unchangedStop(run, report.page_changed);
}

/**
 * After a step that sent nothing (a stale one, a WAIT, a scroll), the field just typed into still takes Enter while
 * the look shows the page it was typed on: focus and the field are as the TYPE left them. Another URL clears it.
 */
export function keepTyped(run: RunState, was: RunLook): void {
  if (run.current.tab.url !== was.tab.url) run.typed = null;
}

/**
 * After a TYPE, whether suggestions showed: code's own words in `recent`, so the next step can confirm the value as
 * the Decision is asked to (its suggestion, else the confirming button, else Enter).
 */
function typedWords(act: StepAct, before: RunLook, after: RunLook): string {
  if (act.op !== 'TYPE') return '';
  const options = optionsShown(after.tree);
  if (options !== '' && options !== optionsShown(before.tree)) return '; suggestions showed';
  // Suggestions that are buttons or links (Ryanair's airports in a tooltip): a row other than the field that holds
  // the typed value, new since the look before, or still there while the table got shorter (the list narrowed).
  const holding = (look: RunLook): string[] => [...look.table.byN.values()]
    .filter((e) => !sameElement(e.cand.fp, act.cand.fp) && holds(e.cand.fp.name, act.value ?? ''))
    .map((e) => e.cand.fp.name);
  const now = holding(after);
  const was = new Set(holding(before));
  const narrowed = before.table.rows.length > after.table.rows.length;
  return now.length > 0 && (now.some((name) => !was.has(name)) || narrowed) ? '; suggestions showed' : '; no suggestion showed';
}

/**
 * After a TYPE, when the look after shows the field empty (a focus handler that cleared it, a page that reset the
 * form): code's own words, so the next step reads the value as gone rather than typed. A field the look no longer
 * shows, an editable region, or a value another field now holds (a picker that moved the text into its own box)
 * says nothing.
 */
function emptiedWords(act: StepAct, after: RunLook): string {
  if (act.op !== 'TYPE') return '';
  const found = findByFingerprint(after.tree, act.cand.fp);
  if (typeof found !== 'object') return '';
  const node = after.tree.nodes[found.node];
  if (node === undefined || !isValueField(node) || node.attrs.contenteditable === true) return '';
  if (norm(node.value ?? '') !== '') return '';
  const moved = after.tree.nodes.some((field) => isValueField(field) && holds(field.value ?? '', act.value ?? ''));
  return moved ? '' : '; the page emptied the field';
}

/**
 * Counts a step that moved the page (an act, a scroll) and ends the run once `UNCHANGED_MAX` in a row changed
 * nothing; a change resets the count.
 */
export function unchangedStop(run: RunState, changed: boolean): RunStop | null {
  run.unchanged = changed ? 0 : run.unchanged + 1;
  if (run.unchanged < UNCHANGED_MAX) return null;
  return {
    verdict: 'no_progress', cause: 'no_progress',
    detail: `${UNCHANGED_MAX} steps in a row changed nothing on the page. Orca delivers clicks and keys only while its `
      + 'browser tab is on screen: bring the tab to the front, then look again',
  };
}
