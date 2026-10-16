import { type ActAction, type BrowserPort, CLICK_ACTIONS, type PageRef } from '../browser';
import { fold, norm } from '../page-model';
import { backsOut, CONFIRMING_ROLES, hasConfirmCue } from './confirm-dialog';
import { wordingXPath } from './dialog-wording-xpath';
import type { Probe } from './probe';
import { assumedOn, countProbe, emptyReading, raise } from './raise-probe';
import type { RiskReading } from './risk-reading';
import { labelledBySelectors, readsSelectors, selectorTexts } from './selector-texts';

/** An open dialog: `<dialog open>`, or a dialog, alertdialog or modal role that is not hidden. */
const OPEN_DIALOG_PARTS = [
  'dialog[open]',
  ...['[role~=dialog]', '[role~=alertdialog]', '[aria-modal=true]'].map((css) => `${css}:not([hidden]):not([aria-hidden=true])`),
];
const OPEN_DIALOGS_CSS = OPEN_DIALOG_PARTS.join(', ');
/** An open dialog named by its `aria-label`: wording the page text never shows. */
const LABELLED_DIALOGS = OPEN_DIALOG_PARTS.map((css) => `${css}[aria-label]`).join(', ');
const roleToken = (role: string): string => `contains(concat(' ', normalize-space(@role), ' '), ' ${role} ')`;
/**
 * The same open dialogs as XPath, the one selector form whose k-th match across the whole page can be read
 * (`(…)[k]`). Its literals take single quotes only, so it travels in one double-quoted `exec` token.
 */
const OPEN_DIALOGS_XPATH = `//*[(self::dialog and @open) or ((${roleToken('dialog')} or ${roleToken('alertdialog')} `
  + `or @aria-modal='true') and not(@hidden) and not(@aria-hidden='true'))]`;
const OPEN_DIALOGS = `xpath=${OPEN_DIALOGS_XPATH}`;
const nthDialog = (k: number): string => `(${OPEN_DIALOGS_XPATH})[${k}]`;
/** Past this many open dialogs, they are not read one by one: the wide read applies. */
const DIALOGS_READ_MAX = 6;
/** Past this many wording elements in one dialog, its whole text is read as its wording. */
const WORDING_READ_MAX = 16;
const REASON = 'raiser:confirm-dialog';

/** What the live ref is: its names, its explicit role, its own text, and the page's body text. */
type LiveClick = { names: readonly string[]; role: string | null; text: string; bodyText: string };

/** One open dialog as the tree rule reads it: its wording (name, labels, own text) and the whole text it shows. */
type OpenDialog = { wording: string[]; text: string };

/**
 * The text of a dialog's wording elements (`wordingXPath`): never a control's label or what was typed into a
 * field. With none (a dialog of controls only, or one that sits in a control) or past `WORDING_READ_MAX`, the
 * dialog's whole text, labels included: what cannot be told apart counts as wording, since risk only rises.
 */
async function readWording(
  port: BrowserPort, page: PageRef, wording: string, count: number, whole: string,
): Promise<string[]> {
  if (count === 0 || count > WORDING_READ_MAX) return [whole];
  return Promise.all(Array.from({ length: count }, (_, j) => port.selectorText!(page, `xpath=(${wording})[${j + 1}]`)));
}

/** The `k`-th open dialog, read the way the tree rule reads one (`isConfirmDialog`): its name, labels and wording. */
async function readDialog(port: BrowserPort, page: PageRef, k: number): Promise<OpenDialog> {
  const selector = `xpath=${nthDialog(k)}`;
  const wording = wordingXPath(nthDialog(k));
  const [text, label, labelledBy, count] = await Promise.all([
    port.selectorText!(page, selector),
    port.selectorAttr!(page, selector, 'aria-label'),
    port.selectorAttr!(page, selector, 'aria-labelledby'),
    port.count!(page, `xpath=${wording}`),
  ]);
  const [named, own] = await Promise.all([
    selectorTexts(port, page, labelledBySelectors(labelledBy)),
    readWording(port, page, wording, count, text),
  ]);
  return { wording: [label ?? '', ...named, ...own], text: norm(text) };
}

/** Each of the `n` open dialogs; `null` when the backend cannot read them one by one or a read failed. */
async function readOpenDialogs(port: BrowserPort, page: PageRef, n: number): Promise<OpenDialog[] | null> {
  if (!readsSelectors(port) || port.selectorAttr === undefined || !port.features().has('attr')) return null;
  try {
    return await Promise.all(Array.from({ length: n }, (_, i) => readDialog(port, page, i + 1)));
  } catch (error) {
    assumedOn(error);
    return null;
  }
}

/** How many dialogs are open, by the XPath form; `null` when the backend could not count it. */
async function openCount(port: BrowserPort, page: PageRef): Promise<number | null> {
  try {
    return await port.count!(page, OPEN_DIALOGS);
  } catch (error) {
    assumedOn(error);
    return null;
  }
}

/**
 * The wide read, for when the dialogs cannot be read one by one (more than six are open, or the backend lacks the
 * reads): an open dialog, and a cue anywhere in the page text or a dialog named by an `aria-label` the text never
 * shows. Risk only rises, so what cannot be told apart counts as a confirm dialog.
 */
async function wideRead(port: BrowserPort, page: PageRef, open: Probe, bodyText: string): Promise<Probe> {
  const labelled: Probe = port.count !== undefined && port.features().has('count')
    ? await countProbe(port, page, LABELLED_DIALOGS)
    : 'assumed';
  const cue = hasConfirmCue(bodyText);
  if (!cue && labelled === 'miss') return 'miss';
  return open === 'hit' && (cue || labelled === 'hit') ? 'hit' : 'assumed';
}

/**
 * The confirm-dialog rule (spec §8.5) for a click on a live ref, where no snapshot shows whether the element sits
 * in a dialog: the confirming button of a confirm dialog is irreversible, never its Cancel or No. It reads each open
 * dialog (up to six) as the tree rule does: a confirm dialog's name, labels or wording (never a control's label)
 * carry a confirm cue or an irreversible term. It raises only an element whose own text a confirm dialog shows (or
 * that shows none, which cannot be placed), so a sign-in or consent button in a plain dialog keeps the class
 * `guard` gives it. When the dialogs cannot be read one by one it reads wider (`wideRead`). A control whose every
 * name backs out, or whose explicit role cannot confirm, is left alone.
 */
export async function confirmDialogRaiser(
  port: BrowserPort, page: PageRef, action: ActAction, live: LiveClick,
): Promise<RiskReading> {
  const out = emptyReading();
  if (!CLICK_ACTIONS.has(action) || (live.role !== null && !CONFIRMING_ROLES.has(live.role)) || backsOut(live.names)) return out;
  if (port.count === undefined || !port.features().has('count')) {
    raise(out, 'irreversible', REASON, await wideRead(port, page, 'assumed', live.bodyText));
    return out;
  }
  const open = await openCount(port, page);
  if (open === 0) return out;
  const dialogs = open !== null && open <= DIALOGS_READ_MAX ? await readOpenDialogs(port, page, open) : null;
  if (dialogs === null) {
    const probe: Probe = open === null ? await countProbe(port, page, OPEN_DIALOGS_CSS) : 'hit';
    if (probe !== 'miss') raise(out, 'irreversible', REASON, await wideRead(port, page, probe, live.bodyText));
    return out;
  }
  const confirming = dialogs.filter((dialog) => dialog.wording.some(hasConfirmCue));
  if (confirming.length === 0) return out;
  const own = fold(live.text);
  if (own !== '' && !confirming.some((dialog) => fold(dialog.text).includes(own))) return out;
  raise(out, 'irreversible', REASON, 'hit');
  return out;
}
