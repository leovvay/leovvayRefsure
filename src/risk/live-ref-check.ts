import type { BrowserPort, PageRef, Ref } from '../browser';
import { cutName, fold, norm } from '../page-model';
import type { LiveName } from './live-name';

/** Where an element without text carries its accessible name, in the order a browser reads it. */
const LABEL_ATTRS = ['aria-label', 'placeholder', 'title'] as const;

/**
 * The name check itself (spec §8.3): `fold(seen)` equals or contains `fold(expectName)`. A mismatch carries what
 * was seen, `norm`ed and cut at 90; an empty `expectName` never passes.
 */
export function nameCheck(seen: string, expectName: string): 'ok' | { mismatch: string } {
  const want = fold(expectName);
  if (want !== '' && fold(seen).includes(want)) return 'ok';
  return { mismatch: cutName(norm(seen)) };
}

/**
 * The live-ref name check (spec §8.3): `fold(innerText)` equals or contains `fold(expectName)`. With no text, the
 * first non-empty of `aria-label`, `placeholder` and `title` is compared instead. Browser errors propagate (a
 * stale ref is the registry's `stale`).
 */
export async function liveRefCheck(
  port: BrowserPort, page: PageRef, ref: Ref, expectName: string,
): Promise<'ok' | { mismatch: string }> {
  return nameCheck(await seenName(port, page, ref), expectName);
}

function hasAttr(port: BrowserPort): boolean {
  return port.attr !== undefined && port.features().has('attr');
}

async function seenName(port: BrowserPort, page: PageRef, ref: Ref): Promise<string> {
  const text = await port.text(page, ref);
  if (norm(text) !== '') return text;
  if (!hasAttr(port)) return '';
  for (const name of LABEL_ATTRS) {
    const value = await port.attr!(page, ref, name);
    if (value !== null && norm(value) !== '') return value;
  }
  return '';
}

/**
 * Every name a live ref carries, read at once and without a snapshot: `seen` for the name check, `sources` for
 * the lexicon. One text read plus one attribute read per label source, in parallel.
 */
export async function readLiveName(port: BrowserPort, page: PageRef, ref: Ref): Promise<LiveName> {
  const attrs = hasAttr(port) ? LABEL_ATTRS : [];
  const [text, labels] = await Promise.all([
    port.text(page, ref),
    Promise.all(attrs.map((name) => port.attr!(page, ref, name))),
  ]);
  const byName = new Map<string, string>();
  attrs.forEach((name, i) => {
    const value = labels[i];
    if (typeof value === 'string' && norm(value) !== '') byName.set(name, value);
  });
  const seen = norm(text) !== '' ? text : (LABEL_ATTRS.map((name) => byName.get(name)).find((v) => v !== undefined) ?? '');
  const sources = [text, byName.get('aria-label'), byName.get('title'), byName.get('placeholder')]
    .filter((value): value is string => typeof value === 'string' && norm(value) !== '');
  return { seen, sources: [...new Set(sources.map(norm))] };
}
