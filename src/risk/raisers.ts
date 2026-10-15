import { isBrowserError } from '../browser';
import type { ActAction, BrowserPort, PageRef, Ref } from '../browser';
import { maxRisk } from './max-risk';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';
import { readTagAttrs } from './tag-attrs';

const PASSWORD_INPUTS = 'input[type=password]';
const CARD_INPUTS = [
  'input[autocomplete*="cc-" i]',
  'input[name*=card i]', 'input[name*=cvv i]', 'input[name*=cvc i]', 'input[name*=iban i]',
  'input[id*=card i]', 'input[id*=cvv i]', 'input[id*=cvc i]', 'input[id*=iban i]',
].join(',');
const CARD_NAME = /card|cvv|cvc|iban/i;
const AUTH_AUTOCOMPLETE = /(^|\s)(current-password|new-password|one-time-code)(\s|$)/i;
const CC_AUTOCOMPLETE = /(^|\s)cc-/i;
const CLICKS: ReadonlySet<ActAction> = new Set<ActAction>(['click', 'dblclick']);

type Probe = 'hit' | 'miss' | 'assumed';

/**
 * A raiser that cannot read counts as hit (spec §8.3). A slow or failing backend call is such a case; a page that
 * is gone, Orca down or a stale ref still propagate for the registry to map.
 */
function assumedOn(error: unknown): Probe {
  if (isBrowserError(error) && (error.code === 'timeout' || error.code === 'backend_error')) return 'assumed';
  throw error;
}

async function countProbe(port: BrowserPort, page: PageRef, css: string): Promise<Probe> {
  try {
    return (await port.count!(page, css)) > 0 ? 'hit' : 'miss';
  } catch (error) {
    return assumedOn(error);
  }
}

function raise(into: { class: RiskClass; reasons: string[] }, cls: RiskClass, reason: string, probe: Probe): void {
  if (probe === 'miss') return;
  into.class = maxRisk(into.class, cls);
  into.reasons.push(probe === 'assumed' ? `${reason}:assumed` : reason);
}

/**
 * Page-level raisers for a click (spec §8.3): a password input on the page → auth; a card, CVV or IBAN input →
 * money. A backend without `count` counts both as hit. Other actions read nothing here.
 */
export async function pageRaisers(port: BrowserPort, page: PageRef, action: ActAction): Promise<RiskReading> {
  if (!CLICKS.has(action)) return { class: 'read', reasons: [] };
  const out = { class: 'read' as RiskClass, reasons: [] as string[] };
  if (port.count === undefined || !port.features().has('count')) {
    raise(out, 'auth', 'raiser:password', 'assumed');
    raise(out, 'money', 'raiser:card', 'assumed');
    return out;
  }
  const [password, card] = await Promise.all([
    countProbe(port, page, PASSWORD_INPUTS),
    countProbe(port, page, CARD_INPUTS),
  ]);
  raise(out, 'auth', 'raiser:password', password);
  raise(out, 'money', 'raiser:card', card);
  return out;
}

type FieldAttrs = Record<'type' | 'autocomplete' | 'name' | 'id', string>;

async function fieldAttrs(port: BrowserPort, page: PageRef, ref: Ref): Promise<FieldAttrs | null> {
  const keys = ['type', 'autocomplete', 'name', 'id'] as const;
  if (port.attr !== undefined && port.features().has('attr')) {
    const values = await Promise.all(keys.map((k) => port.attr!(page, ref, k)));
    return { type: values[0] ?? '', autocomplete: values[1] ?? '', name: values[2] ?? '', id: values[3] ?? '' };
  }
  if (port.html !== undefined && port.features().has('html')) {
    const attrs = readTagAttrs(await port.html(page, ref));
    return { type: attrs.type ?? '', autocomplete: attrs.autocomplete ?? '', name: attrs.name ?? '', id: attrs.id ?? '' };
  }
  return null;
}

/**
 * Field raisers for fill, select, check and uncheck (spec §8.3): `type=password` or a password/one-time-code
 * autocomplete → auth; a `cc-*` autocomplete or a card, CVV or IBAN name → money. Unreadable counts as hit.
 */
export async function fieldRaisers(port: BrowserPort, page: PageRef, ref: Ref): Promise<RiskReading> {
  const out = { class: 'read' as RiskClass, reasons: [] as string[] };
  let attrs: FieldAttrs | null;
  try {
    attrs = await fieldAttrs(port, page, ref);
  } catch (error) {
    assumedOn(error);
    attrs = null;
  }
  if (attrs === null) {
    raise(out, 'auth', 'raiser:password', 'assumed');
    raise(out, 'money', 'raiser:card', 'assumed');
    return out;
  }
  const password = attrs.type.trim().toLowerCase() === 'password' || AUTH_AUTOCOMPLETE.test(attrs.autocomplete);
  raise(out, 'auth', 'raiser:password', password ? 'hit' : 'miss');
  raise(out, 'money', 'raiser:cc-autocomplete', CC_AUTOCOMPLETE.test(attrs.autocomplete) ? 'hit' : 'miss');
  raise(out, 'money', 'raiser:card', CARD_NAME.test(`${attrs.name} ${attrs.id}`) ? 'hit' : 'miss');
  return out;
}
