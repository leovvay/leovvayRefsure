import type { Ref } from '../ax-tree';
import type { SnapshotLine } from './snapshot-line-shape';

// agent-browser prints `- role "name" [k=v, flag, ref=eN] kind [hint, hint]: value`, nested by two spaces. The
// cursor part (`editable [contenteditable]`, `clickable [cursor:pointer]`) follows the attrs of an element found
// by cursor scanning. The name group skips escaped quotes, so `]`, `: ` or `"` in a quoted name never split it.
const LINE = new RegExp(
  '^(?<indent> *)- (?<role>[^\\s"[:]+)(?: "(?<name>(?:[^"\\\\]|\\\\.)*)")?(?: \\[(?<attrs>[^\\]]*)\\])?'
  + '(?<cursor>(?: [^\\s"[\\]:]+(?: \\[[^\\]]*\\])?)*)(?::\\s?(?<value>.*))?$',
);
const CURSOR_PART = / (?<word>[^\s"[\]:]+)(?: \[(?<hints>[^\]]*)\])?/g;
const REF = /^e\d+$/;

export function isRef(text: string): text is Ref {
  return REF.test(text);
}

/** One line of snapshot text, or null when it is not a node line (garbage, or a value's run-on text). */
export function readLine(raw: string): SnapshotLine | null {
  const groups = LINE.exec(raw)?.groups;
  if (!groups || groups.role === undefined) return null;
  const { attrs, ref } = parseAttrs(groups.attrs);
  for (const part of (groups.cursor ?? '').matchAll(CURSOR_PART)) {
    const words = [part.groups?.word ?? '', ...(part.groups?.hints ?? '').split(', ')];
    for (const word of words.map((w) => w.trim())) {
      if (word !== '' && word !== 'ref' && attrs[word] === undefined) attrs[word] = true;
    }
  }
  return {
    indent: (groups.indent ?? '').length,
    role: groups.role,
    name: groups.name === undefined ? '' : unescapeQuoted(groups.name),
    ref,
    attrs,
    value: groups.value ?? null,
  };
}

function parseAttrs(text: string | undefined): { attrs: Record<string, string | true>; ref: Ref | null } {
  const attrs: Record<string, string | true> = {};
  let ref: Ref | null = null;
  if (!text) return { attrs, ref };
  for (const part of text.split(', ')) {
    const item = part.trim();
    if (item === '') continue;
    const eq = item.indexOf('=');
    if (eq === -1) {
      attrs[item] = true;
      continue;
    }
    const key = item.slice(0, eq);
    const value = unquote(item.slice(eq + 1));
    if (key === 'ref') {
      if (isRef(value)) ref = value;
      continue;
    }
    attrs[key] = value;
  }
  return { attrs, ref };
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? unescapeQuoted(value.slice(1, -1)) : value;
}

function unescapeQuoted(raw: string): string {
  if (!raw.includes('\\')) return raw;
  try {
    const out: unknown = JSON.parse(`"${raw}"`);
    return typeof out === 'string' ? out : raw;
  } catch {
    return raw;
  }
}
