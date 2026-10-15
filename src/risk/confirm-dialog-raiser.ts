import type { ActAction, BrowserPort, PageRef } from '../browser';
import { fold, norm } from '../page-model';
import { CONFIRMING_ROLES } from './classify';
import { assumedOn, countProbe, type Probe, raise } from './raise-probe';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';
import { labelledBySelectors, readsSelectors, selectorTexts } from './selector-texts';
import { findTermAnyReading, findTermEveryReading } from './term-match';

const CLICKS: ReadonlySet<ActAction> = new Set<ActAction>(['click', 'dblclick']);
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
const nthDialog = (k: number): string => `xpath=(${OPEN_DIALOGS_XPATH})[${k}]`;
/** Past this many open dialogs, they are not read one by one: the wide read applies. */
const DIALOGS_READ_MAX = 6;
const REASON = 'raiser:confirm-dialog';

/** What the live ref is: its names, its explicit role, its own text, and the page's body text. */
type LiveClick = { names: readonly string[]; role: string | null; text: string; bodyText: string };

/** One open dialog as the tree rule reads it: its wording (name and text) and the text it shows. */
type OpenDialog = { wording: string[]; text: string };

/**
 * A control that backs out of a dialog: every name it carries is a close or cancel word ("No", "Cancel", "×"),
 * in every reading of it.
 */
function backsOut(names: readonly string[]): boolean {
  return names.length > 0 && names.every((name) => findTermEveryReading('dismissClose', name) !== null
    || findTermEveryReading('cancelWords', name) !== null);
}

/** A confirm cue ("are you sure", "confirm", ...) or an irreversible term, spacing-insensitive, in either reading. */
function cued(text: string): boolean {
  return findTermAnyReading('confirmCue', text, { loose: true }) !== null
    || findTermAnyReading('irreversible', text, { loose: true }) !== null;
}

/** One open dialog, read the way the tree rule reads one (`isConfirmDialog`): its name, labels and text. */
async function readDialog(port: BrowserPort, page: PageRef, selector: string): Promise<OpenDialog> {
  const [text, label, labelledBy] = await Promise.all([
    port.selectorText!(page, selector),
    port.selectorAttr!(page, selector, 'aria-label'),
    port.selectorAttr!(page, selector, 'aria-labelledby'),
  ]);
  const named = await selectorTexts(port, page, labelledBySelectors(labelledBy));
  return { wording: [label ?? '', ...named, text], text: norm(text) };
}

/** Each of the `n` open dialogs; `null` when the backend cannot read them one by one or a read failed. */
async function readOpenDialogs(port: BrowserPort, page: PageRef, n: number): Promise<OpenDialog[] | null> {
  if (!readsSelectors(port) || port.selectorAttr === undefined || !port.features().has('attr')) return null;
  try {
    return await Promise.all(Array.from({ length: n }, (_, i) => readDialog(port, page, nthDialog(i + 1))));
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
  const cue = cued(bodyText);
  if (!cue && labelled === 'miss') return 'miss';
  return open === 'hit' && (cue || labelled === 'hit') ? 'hit' : 'assumed';
}

/**
 * The confirm-dialog rule (spec §8.5) for a click on a live ref, where no snapshot shows whether the element sits
 * in a dialog: the confirming button of a confirm dialog is irreversible, never its Cancel or No. It reads each open
 * dialog (up to six) as the tree rule does: a confirm dialog's name, labels or text carry a confirm cue or an
 * irreversible term. It raises only an element whose own text a confirm dialog shows (or that shows none, which
 * cannot be placed), so a sign-in or consent button in a plain dialog keeps the class `guard` gives it. When the
 * dialogs cannot be read one by one it reads wider (`wideRead`). A control whose every name backs out, or whose
 * explicit role cannot confirm, is left alone.
 */
export async function confirmDialogRaiser(
  port: BrowserPort, page: PageRef, action: ActAction, live: LiveClick,
): Promise<RiskReading> {
  const out = { class: 'read' as RiskClass, reasons: [] as string[] };
  if (!CLICKS.has(action) || (live.role !== null && !CONFIRMING_ROLES.has(live.role)) || backsOut(live.names)) return out;
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
  const confirming = dialogs.filter((dialog) => dialog.wording.some(cued));
  if (confirming.length === 0) return out;
  const own = fold(live.text);
  if (own !== '' && !confirming.some((dialog) => fold(dialog.text).includes(own))) return out;
  raise(out, 'irreversible', REASON, 'hit');
  return out;
}
