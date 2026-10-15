import type { AxNode, AxTree, Ref } from '../ax-tree';
import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';

// `- role "name" [k=v, flag, ref=eN]: value`, nested by two spaces. The name group skips escaped quotes, so a
// `]`, `: ` or `"` inside a quoted name never splits the line.
const LINE =
  /^(?<indent> *)- (?<role>[^\s"[:]+)(?: "(?<name>(?:[^"\\]|\\.)*)")?(?: \[(?<attrs>[^\]]*)\])?(?::\s?(?<value>.*))?$/;
const REF = /^e\d+$/;

export function isRef(text: string): text is Ref {
  return REF.test(text);
}

/**
 * Reads agent-browser snapshot JSON (Orca's `{result:{origin, snapshot}}`, the bare result, agent-browser's own
 * `{data:{snapshot}}`, or the snapshot text itself) into a backend-neutral tree. It reads the text, not `refs`,
 * because only the text carries order, nesting, attributes and values. A line it cannot read is counted and skipped.
 */
export function parseSnapshot(json: unknown, pageId: string): AxTree {
  const body = snapshotBody(json);
  if (!body) throw new BrowserError('backend_error', 'the snapshot reply carries no snapshot text');
  const nodes: AxNode[] = [];
  const stack: AxNode[] = [];
  let dropped = 0;
  for (const raw of body.text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const groups = LINE.exec(raw)?.groups;
    if (!groups || groups.role === undefined) {
      dropped += 1;
      continue;
    }
    // A skipped level (odd indent, a dropped parent) attaches the line to the nearest open ancestor.
    const level = Math.floor((groups.indent ?? '').length / 2);
    while (stack.length > level) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const { attrs, ref } = parseAttrs(groups.attrs);
    const node: AxNode = {
      i: nodes.length,
      depth: stack.length,
      role: groups.role,
      name: groups.name === undefined ? '' : unescapeQuoted(groups.name),
      ref,
      attrs,
      value: groups.value === undefined || groups.value === '' ? null : groups.value,
      parent: parent ? parent.i : null,
      children: [],
    };
    parent?.children.push(node.i);
    nodes.push(node);
    stack.push(node);
  }
  return { origin: body.origin, pageId, nodes, dropped };
}

function snapshotBody(json: unknown): { text: string; origin: string } | null {
  if (typeof json === 'string') return { text: json, origin: '' };
  if (!isRecord(json)) return null;
  for (const holder of [json.result, json.data, json]) {
    if (isRecord(holder) && typeof holder.snapshot === 'string') {
      return { text: holder.snapshot, origin: typeof holder.origin === 'string' ? holder.origin : '' };
    }
  }
  return null;
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
