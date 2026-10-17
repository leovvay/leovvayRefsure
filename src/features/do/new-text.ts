import { cutShown, norm, shortPieces, valuePieces } from '../../page-model';
import { type PageReading, type TypedText, typedWithheld, withoutTyped } from '../shared';

const SHOWN_LINES = 8;
const SHOWN_LINE_MAX = 200;

/** The page's lines before the steps, `norm`ed: a line the page showed then is never new text. */
export function baselineOf(before: PageReading): ReadonlySet<string> {
  return new Set(before.text.split(/\r?\n/).map(norm).filter((line) => line !== ''));
}

/**
 * What the new text is cut by: the typing in editable regions, and every value a fill or select typed, which a page
 * may echo ("Results for invoice"). A value too short to cut withholds a text it shows in as a word (spec §7.3).
 */
function withValues(typed: TypedText, values: readonly string[]): TypedText {
  if ('unread' in typed || values.length === 0) return typed;
  return { pieces: valuePieces([...typed.pieces, ...values]), short: [...typed.short, ...shortPieces(values)] };
}

/**
 * The reading cut to its new text: the body lines not among the baseline's, in page order, with the typing and the
 * values to cut (`withValues`). Text that was on the page before the steps, such as an injected "999 rows" box, is
 * never judged. `null` when nothing is new. The cut itself happens where the text is used (`withoutTyped`); the
 * raw lines stay for the `--text` rule, which is read locally only.
 */
export function newReading(whole: PageReading, baseline: ReadonlySet<string>, values: readonly string[]): PageReading | null {
  const lines = whole.text.split(/\r?\n/).map(norm).filter((line) => line !== '' && !baseline.has(line));
  if (lines.length === 0) return null;
  return { tab: whole.tab, text: lines.join('\n'), typed: withValues(whole.typed, values) };
}

/** `new_text` as the envelope shows it: the cut lines, at most 8 of at most 200 characters; none when withheld. */
export function shownLines(reading: PageReading | null): string[] {
  if (reading === null || typedWithheld(reading.text, reading.typed) !== null) return [];
  return withoutTyped(reading.text, reading.typed).split('\n').filter((line) => line !== '')
    .slice(0, SHOWN_LINES).map((line) => cutShown(line, SHOWN_LINE_MAX));
}
