import type { BrowserPort, PageRef } from '../browser';
import { cssString, labelledBySelectors, lookupId, readsSelectors, selectorTexts } from './selector-texts';

/** The elements a `<label>` names (HTML's labelable elements). */
const LABELABLE = ':is(input,select,textarea,button,meter,output,progress)';

/** The attributes of a live ref its outside labels are found by. */
type LabelKeys = { labelledBy: string | null; id: string | null; name: string | null; type: string | null };

/** What the labels outside the element say: `aria-labelledby`, a `<label for>`, and a `<label>` around it. */
type LabelTexts = { labelledBy: string | null; labelFor: string | null; wrapping: string | null };

/**
 * A selector only this element can match, from the attributes it carries (id, name, type), or null when it has none
 * of them. It identifies the element only once a count says exactly one element matches it.
 */
function ownKey(keys: LabelKeys): string | null {
  const id = lookupId(keys.id);
  const parts = [
    id === null ? null : `[id=${cssString(id)}]`,
    keys.name === null ? null : `[name=${cssString(keys.name)}]`,
    keys.type === null ? null : `[type=${cssString(keys.type)}]`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join('');
}

/**
 * The text of the labels that live elsewhere on the page (spec §8.3, the name the snapshot gives): the elements
 * `aria-labelledby` names (up to four), a `<label for>` of the element's id, and a `<label>` wrapped around it
 * (`<label>Password <input type=password></label>`). The wrapping label is read only when the element's own
 * attributes match exactly one element on the page, so it is this element's label and no other's. A dangling id
 * reads as no label, while a failing read still propagates: a label that could not be read must never lower a risk.
 */
export async function labelTexts(port: BrowserPort, page: PageRef, keys: LabelKeys): Promise<LabelTexts> {
  const none: LabelTexts = { labelledBy: null, labelFor: null, wrapping: null };
  if (!readsSelectors(port)) return none;
  const byIds = labelledBySelectors(keys.labelledBy);
  const id = lookupId(keys.id);
  const forCss = id === null ? null : `label[for=${cssString(id)}]`;
  const key = ownKey(keys);
  const wrapCss = key === null ? null : `label:has(${LABELABLE}${key})`;
  const selectors = [...byIds, ...(forCss === null ? [] : [forCss]), ...(wrapCss === null ? [] : [wrapCss])];
  if (selectors.length === 0) return none;
  const [texts, unique] = await Promise.all([
    selectorTexts(port, page, selectors),
    key === null ? Promise.resolve(0) : port.count!(page, key),
  ]);
  const byText = texts.slice(0, byIds.length).filter((text) => text !== '').join(' ');
  const forText = forCss === null ? '' : texts[byIds.length] ?? '';
  const wrapText = wrapCss === null || unique !== 1 ? '' : texts[selectors.length - 1] ?? '';
  return {
    labelledBy: byText === '' ? null : byText,
    labelFor: forText === '' ? null : forText,
    wrapping: wrapText === '' ? null : wrapText,
  };
}
