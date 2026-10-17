import { cutPieces, showsAsWord } from '../../page-model';
import type { TypedText } from './typed-text';

const WITHHELD = '(withheld: this page text may show what was typed into an editable region, which could not be cut '
  + 'out, and typed text is never sent)';
/** Why the text is withheld when the regions were read, but a typed text in them is too short to cut out. */
export const SHORT_TYPED = 'a text typed into an editable region, too short to cut out (one or two characters), shows '
  + 'in the page text as a word';

/** The body text with what was typed into editable regions cut out, or why it may not leave at all. */
function cut(text: string, typed: TypedText): { text: string } | { withheld: string } {
  if ('unread' in typed) return { withheld: typed.unread };
  const rest = typed.pieces.length === 0 ? text : cutPieces(text, typed.pieces);
  return showsAsWord(rest, typed.short) ? { withheld: SHORT_TYPED } : { text: rest };
}

/**
 * Why the body text may not leave at all (spec §7.3), or null when cutting the typed text out is enough: the editable
 * regions could not be read, or a typed text too short to cut out shows in it as a word.
 */
export function typedWithheld(text: string, typed: TypedText): string | null {
  const out = cut(text, typed);
  return 'withheld' in out ? out.withheld : null;
}

/** The note a reading leaves when its text is withheld. */
export function withheldNote(why: string): string {
  return `typed_text_withheld: ${why}; no Decision gets this page's text`;
}

/**
 * Body text as it may leave (spec §7.3): what was typed into editable regions cut out line by line, or, when that
 * cannot be done (`typedWithheld`), a placeholder in place of the whole text. Code rules (`--text`, `--expect-text`)
 * read the raw text, locally.
 */
export function withoutTyped(text: string, typed: TypedText): string {
  const out = cut(text, typed);
  return 'text' in out ? out.text : WITHHELD;
}
