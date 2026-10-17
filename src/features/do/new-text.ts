import { cutPieces, cutShown, fold, norm, shortPieces, showsAsWord, valuePieces } from '../../page-model';
import { escapeRegExp } from '../../shared';
import { type PageReading, type TypedText, typedWithheld, withoutTyped } from '../shared';
import type { DoStep } from './do-step';

const SHOWN_LINES = 8;
const SHOWN_LINE_MAX = 200;
/**
 * What stands where typed text was, in what a Decision reads: "7 results for "[typed]"" still reads as the result
 * of a search, where a blank ("7 results for " "") reads as an empty one.
 */
const TYPED_MARK = '[typed]';

/** What a run's own values cut: the typed text shape, read from its steps (`valuesOf`), never unread. */
type Values = Extract<TypedText, { short: readonly string[] }>;

function linesOf(text: string): string[] {
  return text.split(/\r?\n/).map(norm).filter((line) => line !== '');
}

/**
 * The page's lines before the steps, `norm`ed: a line the page showed then is never new text while it stays.
 * `newReading` drops a line from it once the page no longer shows it, so a line removed and shown again is new.
 */
export function baselineOf(before: PageReading): Set<string> {
  return new Set(linesOf(before.text));
}

/**
 * What the run's own values cut, from its steps: every fill and select value is cut (a page may echo it: "Results
 * for invoice"), and a fill value too short to cut withholds a text it shows in as a word (spec §7.3). A short
 * option label does not: it is page text, already in the select's own option list.
 */
export function valuesOf(steps: readonly DoStep[]): Values {
  const values = steps.flatMap((step) => (step.value === undefined ? [] : [step.value]));
  const filled = steps.flatMap((step) => (step.action === 'fill' && step.value !== undefined ? [step.value] : []));
  return { pieces: valuePieces(values), short: shortPieces(filled) };
}

/** What the new text is cut by: the typing in editable regions, and the run's own values. */
function withValues(typed: TypedText, values: Values): TypedText {
  if ('unread' in typed || (values.pieces.length === 0 && values.short.length === 0)) return typed;
  return { pieces: valuePieces([...typed.pieces, ...values.pieces]), short: [...typed.short, ...values.short] };
}

function decoded(url: string): string {
  try {
    return decodeURIComponent(url.replace(/\+/g, ' '));
  } catch {
    return url;
  }
}

/**
 * The URL as the Decision may read it: only its origin once a value shows in it, raw or decoded, as a GET form puts
 * it in the query ("/help?q=…"). The origin is all the route's origin check reads, so that check is unchanged.
 */
function urlWithout(url: string, values: Values): string {
  const shows = [url, decoded(url)].some((text) => values.pieces.some((piece) => fold(text).includes(fold(piece)))
    || showsAsWord(text, values.short));
  if (!shows) return url;
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? '' : `${origin}/`;
  } catch {
    return '';
  }
}

/**
 * The reading cut to its new text: the body lines beyond the baseline's, in page order, with the typing and the
 * run's values (`valuesOf`) marked (`TYPED_MARK`), and its URL as the Decision may read it (`urlWithout`). Text that
 * was on the page before the steps, such as an injected "999 rows" box, is never judged, and neither is the page
 * echoing a value, by the `--text` rule either. `null` when nothing is new. An empty read (a page mid-update) drops
 * no line. The pieces are spent on the text, so only the short ones stay for the withheld rule.
 */
export function newReading(whole: PageReading, baseline: Set<string>, values: Values): PageReading | null {
  const lines = linesOf(whole.text);
  if (lines.length > 0) {
    const now = new Set(lines);
    for (const line of baseline) if (!now.has(line)) baseline.delete(line);
  }
  const fresh = lines.filter((line) => !baseline.has(line));
  const typed = withValues(whole.typed, values);
  const text = cutPieces(fresh.join('\n'), 'unread' in typed ? values.pieces : typed.pieces, TYPED_MARK);
  if (text === '') return null;
  const left: TypedText = 'unread' in typed ? typed : { pieces: [], short: typed.short };
  return { tab: { ...whole.tab, url: urlWithout(whole.tab.url, values) }, text, typed: left };
}

/**
 * The expectation as a Decision reads it: the run's values marked as they are in the new text, a short one where it
 * shows as a word, so "results for invoice" still matches the page's "results for [typed]".
 */
export function expectationOf(expect: string, values: Values): string {
  const marked = cutPieces(expect, values.pieces, TYPED_MARK);
  return values.short.reduce((out, piece) => out.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(piece)}(?![\\p{L}\\p{N}])`, 'giu'), () => TYPED_MARK,
  ), marked);
}

/**
 * `new_text` as the envelope shows it: the body lines beyond the baseline's with the page's own typing cut, at most 8
 * of at most 200 characters; none when that typing cannot be cut. The run's own values stay: the agent typed them,
 * and a result line read without them ("7 results for " "") reads as an empty search.
 */
export function shownLines(whole: PageReading | null, baseline: Set<string>): string[] {
  if (whole === null || typedWithheld(whole.text, whole.typed) !== null) return [];
  const fresh = linesOf(whole.text).filter((line) => !baseline.has(line)).join('\n');
  return linesOf(withoutTyped(fresh, whole.typed)).slice(0, SHOWN_LINES).map((line) => cutShown(line, SHOWN_LINE_MAX));
}
