import { type ActAction, type BrowserPort, FIELD_ACTIONS, type PageRef, type Ref, VALUE_ACTIONS } from '../browser';
import { cutName, fold, norm } from '../page-model';
import { escapeRegExp } from '../shared';
import type { FieldAttrs } from './field-attrs';
import { labelTexts } from './live-labels';
import type { LiveName } from './live-name';

/** The element's own attributes the name is read from, plus those its labels elsewhere are found by. */
const ATTRS = ['aria-label', 'placeholder', 'title', 'aria-labelledby', 'id', 'name', 'type'] as const;
type AttrName = (typeof ATTRS)[number];
/** `<input>` buttons: no innerText, and the `value` attribute is the label they show. */
const VALUE_LABELLED: ReadonlySet<string> = new Set(['submit', 'button', 'reset']);

/** How `--expect-name` must sit in a name: anywhere (`contains`), or as whole words (`words`). */
type NameMatch = 'contains' | 'words';

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

function hasAttr(port: BrowserPort): boolean {
  return port.attr !== undefined && port.features().has('attr');
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && norm(value) !== '';
}

/** The attribute an element with no innerText shows as its label: an `<input>` button's `value`, an image's `alt`. */
function shownLabelAttr(type: string | null): 'value' | 'alt' | null {
  const kind = type === null ? '' : type.trim().toLowerCase();
  if (VALUE_LABELLED.has(kind)) return 'value';
  return kind === 'image' ? 'alt' : null;
}

/**
 * Every name a live ref carries, read without a snapshot (spec §8.3): its text and attributes at once, then the
 * labels elsewhere on the page that name it (`aria-labelledby`, `<label for>`, a wrapping `<label>`) and, for an
 * `<input>` button with no text, the `value` (or an image button's `alt`) it shows. `action` keeps a field's text
 * out of its names. For a field action it also reads `autocomplete`, so the field raisers need no second read.
 */
export async function readLiveName(port: BrowserPort, page: PageRef, ref: Ref, action?: ActAction): Promise<LiveName> {
  const attrs: readonly AttrName[] = hasAttr(port) ? ATTRS : [];
  const field = attrs.length > 0 && action !== undefined && FIELD_ACTIONS.has(action);
  const [text, values, autocomplete] = await Promise.all([
    port.text(page, ref),
    Promise.all(attrs.map((name) => port.attr!(page, ref, name))),
    // A failed read leaves the field raisers to read it themselves, as they always have.
    field ? port.attr!(page, ref, 'autocomplete').catch(() => undefined) : undefined,
  ]);
  const raw = (name: AttrName): string | null => values[attrs.indexOf(name)] ?? null;
  const attr = (name: AttrName): string | null => {
    const value = raw(name);
    return present(value) ? value : null;
  };
  // A fill or select's text is a value or its options, not its name.
  const fieldText = action !== undefined && VALUE_ACTIONS.has(action);
  const labelAttr = fieldText || present(text) || attrs.length === 0 ? null : shownLabelAttr(attr('type'));
  const [labels, shown] = await Promise.all([
    labelTexts(port, page, {
      labelledBy: attr('aria-labelledby'), id: attr('id'), name: attr('name'), type: attr('type'),
    }),
    labelAttr === null ? null : port.attr!(page, ref, labelAttr),
  ]);
  const inner = present(text) && !fieldText ? text : present(shown) ? shown : null;
  const names = [
    labels.labelledBy, attr('aria-label'), labels.labelFor, labels.wrapping, inner, attr('placeholder'), attr('title'),
  ].filter(present);
  const sources = [...new Set([text, ...names].filter(present).map(norm))];
  const fieldAttrs: FieldAttrs | null = field && autocomplete !== undefined
    ? { type: raw('type') ?? '', autocomplete: autocomplete ?? '', name: raw('name') ?? '', id: raw('id') ?? '' }
    : null;
  return { seen: names[0] ?? '', names, sources, text: norm(text), fieldAttrs };
}
