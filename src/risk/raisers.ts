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
 * `known` is the field's attributes already read off the same ref (`readLiveName`); without it they are read here.
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
