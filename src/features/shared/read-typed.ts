import { type BrowserPort, type PageRef, readsSelectors } from '../../browser';
import { valuePieces } from '../../page-model';
import type { TypedText } from './typed-text';

/**
 * Each outermost editable region (`contenteditable`, not `false`): the one selector form whose k-th match across the
 * page can be read (`(…)[k]`). Its literals take single quotes only, so it travels in one double-quoted token.
 */
const EDITABLE = "@contenteditable and not(translate(@contenteditable, 'FALSE', 'false') = 'false')";
const EDITABLE_ROOTS_XPATH = `//*[${EDITABLE} and not(ancestor::*[${EDITABLE}])]`;
/** Past this many editable regions, they are not read one by one, and the body text is withheld. */
const TYPED_READ_MAX = 16;

/**
 * The text typed into the page's editable regions, as pieces to cut (`valuePieces`). The body text shows what a
 * contenteditable holds (spec §7.3 never sends it), and a textbox value never shows in it. No snapshot is taken, so
 * the agent's refs survive. A backend that cannot count and read selectors, a failed read, or more regions than are
 * read one by one leave it `unread`.
 */
export async function readTyped(port: BrowserPort, page: PageRef): Promise<TypedText> {
  if (!readsSelectors(port)) return { unread: 'this backend cannot read editable regions one by one' };
  try {
    const n = await port.count!(page, `xpath=${EDITABLE_ROOTS_XPATH}`);
    if (n === 0) return { pieces: [] };
    if (n > TYPED_READ_MAX) return { unread: `${n} editable regions, more than the ${TYPED_READ_MAX} read one by one` };
    const texts = await Promise.all(
      Array.from({ length: n }, (_, j) => port.selectorText!(page, `xpath=(${EDITABLE_ROOTS_XPATH})[${j + 1}]`)),
    );
    return { pieces: valuePieces(texts) };
  } catch {
    return { unread: 'the editable regions could not be read' };
  }
}
