import type { BrowserPort, PageRef, Ref } from '../browser';
import { cutName, fold, norm } from '../page-model';

/** Where an element without text carries its accessible name, in the order a browser reads it. */
const LABEL_ATTRS = ['aria-label', 'placeholder', 'title'] as const;

/**
 * The live-ref name check (spec §8.3): `fold(innerText)` equals or contains `fold(expectName)`. With no text, the
 * first non-empty of `aria-label`, `placeholder` and `title` is compared instead. A mismatch carries what was
 * seen, `norm`ed and cut at 90; an empty `expectName` never passes. Browser errors propagate (a stale ref is the
 * registry's `stale`).
 */
export async function liveRefCheck(
  port: BrowserPort, page: PageRef, ref: Ref, expectName: string,
): Promise<'ok' | { mismatch: string }> {
  const want = fold(expectName);
  const seen = await seenName(port, page, ref);
  if (want === '') return { mismatch: cutName(norm(seen)) };
  return fold(seen).includes(want) ? 'ok' : { mismatch: cutName(norm(seen)) };
}

async function seenName(port: BrowserPort, page: PageRef, ref: Ref): Promise<string> {
  const text = await port.text(page, ref);
  if (norm(text) !== '') return text;
  if (port.attr === undefined || !port.features().has('attr')) return '';
  for (const name of LABEL_ATTRS) {
    const value = await port.attr(page, ref, name);
    if (value !== null && norm(value) !== '') return value;
  }
  return '';
}
