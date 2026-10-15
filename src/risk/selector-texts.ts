import type { BrowserPort, PageRef } from '../browser';
import { norm } from '../page-model';

const LABELLED_BY_MAX = 4;
const ID_MAX = 200;

/** A CSS string literal: quotes and backslashes escaped, control characters as hex escapes. */
export function cssString(value: string): string {
  const escaped = value
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
  return `"${escaped}"`;
}

/** Whether the port can count CSS selectors and read the text of their first match. */
export function readsSelectors(port: BrowserPort): boolean {
  const has = port.features();
  return port.count !== undefined && port.selectorText !== undefined && has.has('count') && has.has('selector-text');
}

/**
 * The `norm`ed innerText of the first element each selector matches, `''` for one that matches none. Each is
 * counted before it is read, so a missing element reads as no text while a failing read still propagates: a text
 * that could not be read must never lower a risk.
 */
export async function selectorTexts(port: BrowserPort, page: PageRef, selectors: readonly string[]): Promise<string[]> {
  if (selectors.length === 0) return [];
  const counts = await Promise.all(selectors.map((css) => port.count!(page, css)));
  const texts = await Promise.all(selectors.map((css, i) => ((counts[i] ?? 0) > 0 ? port.selectorText!(page, css) : '')));
  return texts.map(norm);
}

/** The selectors of the elements an `aria-labelledby` value names: up to four ids, each at most 200 characters. */
export function labelledBySelectors(labelledBy: string | null): string[] {
  if (labelledBy === null) return [];
  return [...new Set(labelledBy.split(/\s+/u))]
    .filter((one) => one !== '' && one.length <= ID_MAX)
    .slice(0, LABELLED_BY_MAX)
    .map((one) => `[id=${cssString(one)}]`);
}

/** An id short enough to look up, or null. */
export function lookupId(id: string | null): string | null {
  return id !== null && id.trim() !== '' && id.length <= ID_MAX ? id : null;
}
