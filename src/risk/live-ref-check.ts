import type { ActAction, BrowserPort, PageRef, Ref } from '../browser';
import { cutName, fold, norm } from '../page-model';
import { labelTexts } from './live-labels';
import type { LiveName } from './live-name';

/** The element's own attributes the name is read from, plus those its labels elsewhere are found by. */
const ATTRS = ['aria-label', 'placeholder', 'title', 'aria-labelledby', 'id', 'name', 'type'] as const;
type AttrName = (typeof ATTRS)[number];
/** For these the element's text is a value or its options, not its name. */
const FIELD_TEXT: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select']);

/** How `--expect-name` must sit in a name: anywhere (`contains`), or as whole words (`words`). */
export type NameMatch = 'contains' | 'words';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** `want` in `name`, both folded: anywhere, or bounded by no letter or digit on either side. */
function holds(name: string, want: string, match: NameMatch): boolean {
  if (match === 'contains') return name.includes(want);
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(want)}(?![\\p{L}\\p{N}])`, 'u').test(name);
}

/**
 * The name check itself (spec §8.3): `fold(expectName)` is contained in one of the names the live ref carries; with
 * `words`, as whole words, so one letter never passes for "Delete project". A mismatch carries the name it shows,
 * `norm`ed and cut at 90; an empty `expectName` never passes.
 */
export function nameCheck(
  live: Pick<LiveName, 'seen' | 'names'>, expectName: string, match: NameMatch = 'contains',
): 'ok' | { mismatch: string } {
  const want = fold(expectName);
  if (want !== '' && live.names.some((name) => holds(fold(name), want, match))) return 'ok';
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

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && norm(value) !== '';
}

/**
 * Every name a live ref carries, read without a snapshot (spec §8.3): its text and attributes at once, then the
 * labels elsewhere on the page that name it (`aria-labelledby`, `<label for>`, a wrapping `<label>`). `action`
 * keeps a field's text out of its names.
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
  const labels = await labelTexts(port, page, {
    labelledBy: attr('aria-labelledby'), id: attr('id'), name: attr('name'), type: attr('type'),
  });
  const inner = present(text) && !(action !== undefined && FIELD_TEXT.has(action)) ? text : null;
  const names = [
    labels.labelledBy, attr('aria-label'), labels.labelFor, labels.wrapping, inner, attr('placeholder'), attr('title'),
  ].filter(present);
  const sources = [...new Set([text, ...names].filter(present).map(norm))];
  return { seen: names[0] ?? '', names, sources, text: norm(text) };
}
