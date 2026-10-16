import { cutPieces } from '../../page-model';
import type { TypedText } from './typed-text';

const WITHHELD = '(withheld: this page text may show what was typed into an editable region, which could not be cut '
  + 'out, and typed text is never sent)';

/**
 * Body text as it may leave (spec §7.3): what was typed into editable regions cut out line by line, or, when that
 * could not be read, the whole text withheld. Code rules (`--text`, `--expect-text`) read the raw text, locally.
 */
export function withoutTyped(text: string, typed: TypedText): string {
  if ('unread' in typed) return WITHHELD;
  return typed.pieces.length === 0 ? text : cutPieces(text, typed.pieces);
}
