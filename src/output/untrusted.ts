import type { Envelope } from './envelope';

/** Page text under an untrusted path is cut to this many UTF-16 units per string (spec §8.6 "listed and capped"). */
export const UNTRUSTED_TEXT_MAX = 2000;

function segmentsOf(path: string): string[] {
  return path.split('.').filter((segment) => segment.length > 0);
}

function childOf(node: unknown, segment: string): unknown {
  if (Array.isArray(node)) {
    const index = Number(segment);
    return Number.isInteger(index) ? node[index] : undefined;
  }
  if (typeof node !== 'object' || node === null || !Object.hasOwn(node, segment)) return undefined;
  return (node as Record<string, unknown>)[segment];
}

function present(root: unknown, path: string): boolean {
  let node: unknown = root;
  for (const segment of segmentsOf(path)) {
    node = childOf(node, segment);
    if (node === undefined) return false;
  }
  return node !== null;
}

function capText(text: string): string {
  if (text.length <= UNTRUSTED_TEXT_MAX) return text;
  let end = UNTRUSTED_TEXT_MAX - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;   // never split a surrogate pair
  return `${text.slice(0, end)}…`;
}

function capDeep(value: unknown): unknown {
  if (typeof value === 'string') return capText(value);
  if (Array.isArray(value)) return value.map(capDeep);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, capDeep(inner)]));
}

function replaceAt(node: unknown, segments: readonly string[], replace: (value: unknown) => unknown): unknown {
  const [head, ...tail] = segments;
  if (head === undefined) return replace(node);
  if (Array.isArray(node)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node;
    const copy = node.slice();
    copy[index] = replaceAt(node[index], tail, replace);
    return copy;
  }
  if (typeof node !== 'object' || node === null || !Object.hasOwn(node, head)) return node;
  return { ...node, [head]: replaceAt((node as Record<string, unknown>)[head], tail, replace) };
}

/**
 * Lists the declared untrusted paths that are present in the envelope (sorted, deduplicated) and caps the
 * page text under each. Paths are dotted from the envelope root, e.g. `result.lines`.
 */
export function applyUntrusted(envelope: Envelope, declared: Iterable<string>): Envelope {
  const paths = [...new Set(declared)].filter((path) => present(envelope, path)).sort();
  let capped: unknown = envelope;
  for (const path of paths) capped = replaceAt(capped, segmentsOf(path), capDeep);
  return { ...(capped as Envelope), untrusted: paths };
}
