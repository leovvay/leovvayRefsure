import { cutName, norm } from '../../../src/page-model';

/*
  The benchmark sets describe an element as one descriptor line:
    <tag role=R> name="N" class=… href=… in="a > b#id > c.cls" under_heading="H" box=x,y,w,h
  `toLineV1` reduces it to line format v1, the only shape refsure sends:
    R "N" in="<path>"
  The path keeps only the `in=` segments that name a place (dialog, alertdialog, nav/navigation, main, form,
  region), outer to inner and bare as refsure shows an unnamed place, then `heading "H"`. Everything else
  (classes, ids, hrefs, boxes, values) is dropped, so the model sees no more than a live snapshot gives it.
*/

/** The descriptor's parsed parts. `attrs` holds every `key=value`, quoted values unescaped. */
export interface Descriptor { tag: string; role: string; attrs: Record<string, string> }

const HEAD = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s+role=([A-Za-z-]+))?>/;
const ATTR = /\s+([A-Za-z_][A-Za-z0-9_-]*)=("(?:[^"\\]|\\.)*"|\S*)/y;

/** An element's implicit role when the descriptor names none. */
const TAG_ROLES: Readonly<Record<string, string>> = {
  a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', input: 'textbox', summary: 'button',
};

/**
 * Roles whose `value=` is their label (`<input type=submit|reset|button>`). Every other role's value is typed or
 * submitted data (a textbox's text, a checkbox's or radio's `on`), never its accessible name.
 */
const NAME_FROM_VALUE_ROLES: ReadonlySet<string> = new Set(['button']);

const PLACE_TAGS: Readonly<Record<string, string>> = { dialog: 'dialog', nav: 'navigation', main: 'main', form: 'form' };
const PLACE_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog', 'navigation', 'main', 'form', 'region']);

function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, raw.endsWith('"') ? -1 : undefined);
  }
}

/** `null` when the line has no `<tag …>` head. */
export function parseDescriptor(line: string): Descriptor | null {
  const head = HEAD.exec(line);
  if (!head) return null;
  const tag = head[1]!.toLowerCase();
  const attrs: Record<string, string> = {};
  ATTR.lastIndex = head[0].length;
  for (let match = ATTR.exec(line); match; match = ATTR.exec(line)) {
    attrs[match[1]!] = unquote(match[2]!);
  }
  return { tag, role: head[2]?.toLowerCase() ?? TAG_ROLES[tag] ?? tag, attrs };
}

/** The accessible name as a snapshot would show it: the descriptor's name, else its visible text or labels. */
export function nameOf(d: Descriptor): string {
  const { attrs } = d;
  const order = ['name', 'text', 'alt', 'title', 'placeholder'];
  if (NAME_FROM_VALUE_ROLES.has(d.role)) order.push('value');
  for (const key of order) {
    const value = attrs[key];
    if (value !== undefined && norm(value) !== '') return value;
  }
  return '';
}

function placeOf(segment: string): string | null {
  const role = /\[role=["']?([A-Za-z-]+)/.exec(segment)?.[1]?.toLowerCase();
  if (role !== undefined && PLACE_ROLES.has(role)) return role;
  const tag = /^[A-Za-z][A-Za-z0-9-]*/.exec(segment.trim())?.[0]?.toLowerCase();
  return tag === undefined ? null : PLACE_TAGS[tag] ?? null;
}

function quoted(text: string): string {
  return JSON.stringify(cutName(norm(text)));
}

/** The v1 path: place segments of `in=`, outer to inner, then the heading; `''` when there is neither. */
export function pathOf(d: Descriptor): string {
  const parts: string[] = [];
  for (const segment of (d.attrs.in ?? '').split(' > ')) {
    const place = placeOf(segment);
    if (place !== null) parts.push(place);
  }
  const heading = d.attrs.under_heading;
  if (heading !== undefined && norm(heading) !== '') parts.push(`heading ${quoted(heading)}`);
  return parts.join(' > ');
}

/** Line format v1 for one descriptor line, or `null` when it does not parse. */
export function toLineV1(line: string): string | null {
  const d = parseDescriptor(line);
  if (!d) return null;
  return `${d.role} ${quoted(nameOf(d))} in=${JSON.stringify(pathOf(d))}`;
}
