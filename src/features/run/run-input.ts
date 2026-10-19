import type { CommandContext } from '../../cli';
import { type Fingerprint, findByFingerprint } from '../../page-model';
import type { StepInput, StepRow } from '../../questions';
import { expectationOf, newReading, type PageReading, shownLines, typedWithheld, withheldNote } from '../shared';
import { enterReadable } from './run-guard';
import type { RunLook } from './run-look-shape';
import { IN_ROW, NOT_TYPED, placedOf, type RunState } from './run-state';

/** The steps the Decision reads in `recent`. */
const RECENT_MAX = 8;
/** The page text `run` reads comes off the snapshot, where nothing typed shows: nothing to cut but its own values. */
export const NOTHING_TYPED = { pieces: [], short: [] } as const;
/** Why the new text is withheld from the Decision when a short `--fill` value shows in it as a word. */
const SHORT_VALUE = 'a --fill value too short to cut out (one or two characters) shows in the new text as a word';
/** Plain text fields: a combobox may be a picker only a click opens (a ticket type), so it stays clickable. */
const TEXT_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'spinbutton']);

/** The look's lines as a page reading, for the new-text helpers `do` shares. */
export function readingOf(look: RunLook): PageReading {
  return { tab: look.tab, text: look.lines.join('\n'), typed: NOTHING_TYPED };
}

/**
 * The new text of the current look, its `--fill` values marked; '' when nothing is new or it is withheld. The
 * baseline is never trimmed here: a dialog hides the page behind it, and its closing must not make that page new.
 * The envelope's `new_text` and `new_text_more` are kept current on the way.
 */
export function newTextOf(ctx: CommandContext, run: RunState): string {
  const whole = readingOf(run.current);
  const fresh = newReading(whole, new Set(run.baseline), run.values);
  const shown = shownLines(whole, run.baseline);
  run.shown = shown.lines;
  run.shownMore = shown.more;
  if (fresh === null) return '';
  if (typedWithheld(fresh.text, fresh.typed) !== null) {
    const note = withheldNote(SHORT_VALUE);
    if (!ctx.trace.notes.includes(note)) ctx.trace.notes.push(note);
    return '';
  }
  return fresh.text;
}

/** The field just typed into is still on the page, and what Enter in it does can be read (`enterReadable`). */
function enterIn(look: RunLook, typed: Fingerprint): boolean {
  const found = findByFingerprint(look.tree, typed);
  return typeof found === 'object' && enterReadable(look.tree, found.node);
}

function textField(look: RunLook, row: StepRow): boolean {
  return row.typable && TEXT_ROLES.has(look.table.byN.get(row.n)?.cand.fp.role ?? '');
}

/**
 * One step's Decision input from the current look. A value a field of the look shows is offered no TYPE; while a
 * value waits to be typed, a text field takes TYPE and no CLICK (typing opens its search box or picker by itself).
 * PRESS_ENTER only right after a TYPE that ran, while that field is still on the page and Enter's effect in it can be
 * read; SCROLL_DOWN when the backend can and no dialog covers the page.
 */
export function stepInput(ctx: CommandContext, run: RunState, newText: string): StepInput {
  const { current, args } = run;
  const features = ctx.browser.features();
  const placed = placedOf(run);
  const pending = placed.some((where) => where === NOT_TYPED);
  const typed = run.typed;
  return {
    goal: args.goal,
    fills: args.fills,
    placed,
    open: placed.map((where) => !where.startsWith(IN_ROW)),
    expect: args.expect === null ? null : expectationOf(args.expect, run.values),
    pageUrl: current.tab.url,
    title: current.tab.title,
    page: current.lines.join('\n'),
    newText,
    recent: run.recent.slice(-RECENT_MAX),
    rows: pending ? current.table.rows.map((row) => ({ ...row, clickable: !textField(current, row) })) : current.table.rows,
    canPressEnter: typed !== null && ctx.browser.pressEnter !== undefined && features.has('press-enter')
      && enterIn(current, typed),
    canScroll: ctx.browser.scrollDown !== undefined && features.has('scroll') && !current.table.rows.some((row) => row.overlay),
  };
}
