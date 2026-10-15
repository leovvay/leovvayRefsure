import { isBrowserError } from '../browser';
import type { ActAction, BrowserPort, PageRef, Ref } from '../browser';
import { fold } from '../page-model';
import { CONFIRMING_ROLES } from './classify';
import { maxRisk } from './max-risk';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';
import { readTagAttrs } from './tag-attrs';
import { findTerm, findTermLoose } from './term-match';

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
/** An open dialog: `<dialog open>`, or a dialog, alertdialog or modal role that is not hidden. */
const OPEN_DIALOG_PARTS = [
  'dialog[open]',
  ...['[role~=dialog]', '[role~=alertdialog]', '[aria-modal=true]'].map((css) => `${css}:not([hidden]):not([aria-hidden=true])`),
];
const OPEN_DIALOGS = OPEN_DIALOG_PARTS.join(', ');
/** An open dialog named by its `aria-label`: wording the page text never shows. */
const LABELLED_DIALOGS = OPEN_DIALOG_PARTS.map((css) => `${css}[aria-label]`).join(', ');

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

/** A control that backs out of a dialog: every name it carries is a close or cancel word ("No", "Cancel", "×"). */
function backsOut(names: readonly string[]): boolean {
  return names.length > 0 && names.every((name) => {
    const folded = fold(name);
    return findTerm('dismissClose', folded) !== null || findTerm('cancelWords', folded) !== null;
  });
}

/**
 * The confirm-dialog rule (spec §8.5) for a click on a live ref, where no snapshot shows whether the element sits
 * in a dialog: the confirming button of a confirm dialog is irreversible, never its Cancel or No. Read wider, so
 * risk only rises: a dialog is open on the page, and its wording may carry a confirm cue or an irreversible term
 * (the page text does, or an open dialog is named by an `aria-label`). A control whose every name backs out, or
 * whose explicit role cannot confirm, is left alone. A backend without `count` counts the dialog as open.
 */
export async function confirmDialogRaiser(
  port: BrowserPort, page: PageRef, action: ActAction, live: { names: readonly string[]; role: string | null; bodyText: string },
): Promise<RiskReading> {
  const out = { class: 'read' as RiskClass, reasons: [] as string[] };
  if (!CLICKS.has(action) || (live.role !== null && !CONFIRMING_ROLES.has(live.role)) || backsOut(live.names)) return out;
  let open: Probe = 'assumed';
  let labelled: Probe = 'assumed';
  if (port.count !== undefined && port.features().has('count')) {
    [open, labelled] = await Promise.all([countProbe(port, page, OPEN_DIALOGS), countProbe(port, page, LABELLED_DIALOGS)]);
  }
  if (open === 'miss') return out;
  const text = fold(live.bodyText);
  const cue = findTermLoose('confirmCue', text) !== null || findTermLoose('irreversible', text) !== null;
  if (!cue && labelled === 'miss') return out;
  const sure = open === 'hit' && (cue || labelled === 'hit');
  raise(out, 'irreversible', 'raiser:confirm-dialog', sure ? 'hit' : 'assumed');
  return out;
}
