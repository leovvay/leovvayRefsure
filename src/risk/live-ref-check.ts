import type { ActAction, BrowserPort, PageRef, Ref } from '../browser';
import { cutName, fold, norm } from '../page-model';
import type { LiveName } from './live-name';

/** The element's own attributes the name is read from, plus the two that point at a label elsewhere. */
const ATTRS = ['aria-label', 'placeholder', 'title', 'aria-labelledby', 'id'] as const;
type AttrName = (typeof ATTRS)[number];
/** For these the element's text is a value or its options, not its name. */
const FIELD_TEXT: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select']);
const LABELLED_BY_MAX = 4;
const ID_MAX = 200;

/**
 * The name check itself (spec §8.3): `fold(expectName)` is contained in one of the names the live ref carries. A
 * mismatch carries the name it shows, `norm`ed and cut at 90; an empty `expectName` never passes.
 */
export function nameCheck(live: Pick<LiveName, 'seen' | 'names'>, expectName: string): 'ok' | { mismatch: string } {
  const want = fold(expectName);
  if (want !== '' && live.names.some((name) => fold(name).includes(want))) return 'ok';
  return { mismatch: cutName(norm(live.seen)) };
}

/** The live-ref name check, reading the ref's names first. Browser errors propagate (a stale ref is `stale`). */
export async function liveRefCheck(
  port: BrowserPort, page: PageRef, ref: Ref, expectName: string, action?: ActAction,
): Promise<'ok' | { mismatch: string }> {
  return nameCheck(await readLiveName(port, page, ref, action), expectName);
}

function hasAttr(port: BrowserPort): boolean {
  return port.attr !== undefined && port.features().has('attr');
}

/** A CSS string literal: quotes and backslashes escaped, control characters as hex escapes. */
function cssString(value: string): string {
  const escaped = value
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
  return `"${escaped}"`;
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && norm(value) !== '';
}

/**
 * The text of the labels that live elsewhere on the page: the elements `aria-labelledby` names (up to four) and a
 * `<label for>` of the element's id. Each is counted before it is read, so a dangling id reads as no label while a
 * failing read still propagates: a label that could not be read must never lower the risk.
 */
async function labelTexts(
  port: BrowserPort, page: PageRef, labelledBy: string | null, id: string | null,
): Promise<{ labelledBy: string | null; labelFor: string | null }> {
  const none = { labelledBy: null, labelFor: null };
  const has = port.features();
  if (port.count === undefined || port.selectorText === undefined || !has.has('count') || !has.has('selector-text')) {
    return none;
  }
  const ids = labelledBy === null ? [] : [...new Set(labelledBy.split(/\s+/u))]
    .filter((one) => one !== '' && one.length <= ID_MAX).slice(0, LABELLED_BY_MAX);
  const selectors = ids.map((one) => `[id=${cssString(one)}]`);
  if (id !== null && id.trim() !== '' && id.length <= ID_MAX) selectors.push(`label[for=${cssString(id)}]`);
  if (selectors.length === 0) return none;
  const counts = await Promise.all(selectors.map((css) => port.count!(page, css)));
  const texts = await Promise.all(selectors.map((css, i) => ((counts[i] ?? 0) > 0 ? port.selectorText!(page, css) : '')));
  const byText = texts.slice(0, ids.length).map(norm).filter((text) => text !== '').join(' ');
  const forText = selectors.length > ids.length ? norm(texts[ids.length] ?? '') : '';
  return { labelledBy: byText === '' ? null : byText, labelFor: forText === '' ? null : forText };
}

/**
 * Every name a live ref carries, read without a snapshot (spec §8.3): its text and label attributes at once, then
 * the labels elsewhere on the page when it points at any. `action` keeps a field's text out of its names.
 */
export async function readLiveName(port: BrowserPort, page: PageRef, ref: Ref, action?: ActAction): Promise<LiveName> {
  const attrs: readonly AttrName[] = hasAttr(port) ? ATTRS : [];
  const [text, values] = await Promise.all([
    port.text(page, ref),
    Promise.all(attrs.map((name) => port.attr!(page, ref, name))),
  ]);
  const attr = (name: AttrName): string | null => {
    const value = values[attrs.indexOf(name)];
    return present(value) ? value : null;
  };
  const labels = await labelTexts(port, page, attr('aria-labelledby'), attr('id'));
  const inner = present(text) && !(action !== undefined && FIELD_TEXT.has(action)) ? text : null;
  const names = [labels.labelledBy, attr('aria-label'), labels.labelFor, inner, attr('placeholder'), attr('title')]
    .filter(present);
  const sources = [...new Set([text, ...names].filter(present).map(norm))];
  return { seen: names[0] ?? '', names, sources };
}
