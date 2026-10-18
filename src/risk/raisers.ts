import { type ActAction, type BrowserPort, CLICK_ACTIONS, type PageRef, type Ref } from '../browser';
import type { FieldAttrs } from './field-attrs';
import { assumedOn, countProbe, emptyReading, raise } from './raise-probe';
import type { RiskReading } from './risk-reading';

const PASSWORD_INPUTS = 'input[type=password]';
/** What a card, CVV or IBAN input carries in its name or id; the page and field raisers read the same words. */
const CARD_WORDS = ['card', 'cvv', 'cvc', 'iban'] as const;
const CARD_INPUTS = [
  'input[autocomplete*="cc-" i]',
  ...['name', 'id'].flatMap((attr) => CARD_WORDS.map((word) => `input[${attr}*=${word} i]`)),
].join(',');
const CARD_NAME = new RegExp(CARD_WORDS.join('|'), 'i');
/** Either input: one count settles both raisers on a page with neither, as most pages are. */
const RAISER_INPUTS = `${PASSWORD_INPUTS},${CARD_INPUTS}`;
const AUTH_AUTOCOMPLETE = /(^|\s)(current-password|new-password|one-time-code)(\s|$)/i;
const CC_AUTOCOMPLETE = /(^|\s)cc-/i;
/**
 * Any element a field act can reach (a native field, an element with a role, an editable region, a focusable one)
 * carrying an attribute a page or a field raiser reads, loosely matched: a superset of both. None on the page means
 * every one of them misses, as each read would. Elements no act reaches stay out: a page's `<meta name=twitter:card>`
 * would otherwise match nearly every page.
 */
const ANY_RAISER = `:is(input, textarea, select, [role], [contenteditable], [tabindex]):is(${[
  '[type*=password i]', '[autocomplete*=password i]', '[autocomplete*=one-time-code i]', '[autocomplete*="cc-" i]',
  ...['name', 'id'].flatMap((attr) => CARD_WORDS.map((word) => `[${attr}*=${word} i]`)),
].join(', ')})`;
/** What a field carries on a page where `noRaiserOnPage` holds: none of the attributes the field raisers read. */
export const NO_FIELD_ATTRS: FieldAttrs = Object.freeze({ type: '', autocomplete: '', name: '', id: '' });

/** What cannot be read counts as both a password and a card input (spec §8.3). */
function assumedReading(): RiskReading {
  const out = emptyReading();
  raise(out, 'auth', 'raiser:password', 'assumed');
  raise(out, 'money', 'raiser:card', 'assumed');
  return out;
}

/**
 * Page-level raisers for a click (spec §8.3): a password input on the page → auth; a card, CVV or IBAN input →
 * money. A backend without `count` counts both as hit. Other actions read nothing here. One count of either input
 * comes first: none on the page is both misses, as the two counts would read; a hit or a failed read counts each.
 */
export async function pageRaisers(port: BrowserPort, page: PageRef, action: ActAction): Promise<RiskReading> {
  if (!CLICK_ACTIONS.has(action)) return emptyReading();
  if (port.count === undefined || !port.features().has('count')) return assumedReading();
  const out = emptyReading();
  if (await countProbe(port, page, RAISER_INPUTS) === 'miss') return out;
  const [password, card] = await Promise.all([
    countProbe(port, page, PASSWORD_INPUTS),
    countProbe(port, page, CARD_INPUTS),
  ]);
  raise(out, 'auth', 'raiser:password', password);
  raise(out, 'money', 'raiser:card', card);
  return out;
}

/**
 * Whether one count shows that no raiser can fire on the page as it is now: no element there carries an attribute
 * any page or field raiser reads (`ANY_RAISER`). False when the backend cannot count, the read fails, or one does.
 * A page gone, Orca down or a stale ref still propagate. A count reads the top document only: a field the snapshot
 * shows inside a frame (a payment provider's card field) is not covered, and its own attributes must be read.
 */
export async function noRaiserOnPage(port: BrowserPort, page: PageRef): Promise<boolean> {
  if (port.count === undefined || !port.features().has('count')) return false;
  return await countProbe(port, page, ANY_RAISER) === 'miss';
}

/** An editable region (`contenteditable`, not `false`) anywhere in the top document. */
const EDITABLE_REGION = '[contenteditable]:not([contenteditable=false i])';

/**
 * `noRaiserOnPage` and no editable region either, in the one count: a superset of its selector, so a miss proves
 * what `noRaiserOnPage` proves, and that every value field of the top document is a native one. False whenever it
 * cannot show that (a hit, a failed read, no count).
 */
export async function noRaiserNorEditableOnPage(port: BrowserPort, page: PageRef): Promise<boolean> {
  if (port.count === undefined || !port.features().has('count')) return false;
  return await countProbe(port, page, `${ANY_RAISER}, ${EDITABLE_REGION}`) === 'miss';
}

async function fieldAttrs(port: BrowserPort, page: PageRef, ref: Ref): Promise<FieldAttrs | null> {
  const keys = ['type', 'autocomplete', 'name', 'id'] as const;
  if (port.attr !== undefined && port.features().has('attr')) {
    const values = await Promise.all(keys.map((k) => port.attr!(page, ref, k)));
    return { type: values[0] ?? '', autocomplete: values[1] ?? '', name: values[2] ?? '', id: values[3] ?? '' };
  }
  return null;
}

/**
 * Field raisers for fill, select, check and uncheck (spec §8.3): `type=password` or a password/one-time-code
 * autocomplete → auth; a `cc-*` autocomplete or a card, CVV or IBAN name → money. Unreadable counts as hit.
 * `known` is the field's attributes already read off the same ref (`readLiveName`), or `NO_FIELD_ATTRS` when a
 * count showed no raiser on the page and the field sits in no frame (`noRaiserOnPage`); without it they are read
 * here.
 */
export async function fieldRaisers(
  port: BrowserPort, page: PageRef, ref: Ref, known?: FieldAttrs | null,
): Promise<RiskReading> {
  let attrs: FieldAttrs | null = known ?? null;
  if (attrs === null) {
    try {
      attrs = await fieldAttrs(port, page, ref);
    } catch (error) {
      assumedOn(error);
      attrs = null;
    }
  }
  if (attrs === null) return assumedReading();
  const out = emptyReading();
  const password = attrs.type.trim().toLowerCase() === 'password' || AUTH_AUTOCOMPLETE.test(attrs.autocomplete);
  raise(out, 'auth', 'raiser:password', password ? 'hit' : 'miss');
  raise(out, 'money', 'raiser:cc-autocomplete', CC_AUTOCOMPLETE.test(attrs.autocomplete) ? 'hit' : 'miss');
  raise(out, 'money', 'raiser:card', CARD_NAME.test(`${attrs.name} ${attrs.id}`) ? 'hit' : 'miss');
  return out;
}
