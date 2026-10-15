import { INTERACTIVE_ROLES } from '../page-model';

// XPath literals here take single quotes only, as the open-dialog XPath they extend does.

/** An element's first `role` token, space-padded; `'  '` when it has none. Chrome reads the first valid token. */
const FIRST_ROLE = "concat(' ', substring-before(concat(normalize-space(@role), ' '), ' '), ' ')";
/** HTML elements the snapshot shows with an interactive role, when no `role` attribute overrides theirs. */
const NATIVE_CONTROLS = 'self::button or self::a[@href] or self::area[@href] or self::input or self::select '
  + 'or self::textarea or self::option';
const HEADINGS = 'self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6';
/** An editable region, a value field the tree never reads wording from; an editable heading keeps its name. */
const EDITABLE = `@contenteditable and not(translate(@contenteditable, 'FALSE', 'false')='false') and not(${HEADINGS})`;

/**
 * What the snapshot shows as a control (`INTERACTIVE_ROLES`) or a value field, read off the DOM. It errs toward
 * not a control (a `<summary>`, a `<button role=heading>`, a role whose first token is unknown): text it misses
 * counts as wording, which can only raise a click.
 */
const CONTROL = `((${NATIVE_CONTROLS}) and normalize-space(@role)='') `
  + `or contains(' ${[...INTERACTIVE_ROLES].join(' ')} ', ${FIRST_ROLE}) or (${EDITABLE})`;

/**
 * The elements of `dialog` (an XPath naming one element) whose own text is dialog wording, as the tree rule reads
 * it (`wordingOf`): every element in it, itself included, that holds text of its own and is no control or value
 * field and sits in none. Each one's innerText may still carry a control nested in it (a link in a paragraph),
 * which only raises. A dialog that sits in a control matches none, and is read whole.
 */
export function wordingXPath(dialog: string): string {
  return `${dialog}/descendant-or-self::*[text()[normalize-space()]][not(ancestor-or-self::*[${CONTROL}])]`;
}
