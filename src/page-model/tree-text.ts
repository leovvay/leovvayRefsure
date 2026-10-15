import type { AxNode, AxTree } from '../browser';
import { norm } from './normalize';

/**
 * Fields whose StaticText children repeat what was typed (phase 0: a textbox carries its value after `: ` and as
 * a StaticText child). That text never enters a line, a page view, a row or a Decision.
 */
export const VALUE_FIELD_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/**
 * A value field: one of `VALUE_FIELD_ROLES`, or an editable region of any role. agent-browser prints the latter as
 * `generic "Notes" [ref=e3] editable [contenteditable]: <typed text>`, its StaticText repeating the typing.
 */
export function isValueField(node: AxNode): boolean {
  return VALUE_FIELD_ROLES.has(node.role) || node.attrs.contenteditable === true;
}

const insideMemo = new WeakMap<AxTree, readonly boolean[]>();

/** The ancestor walk itself: whether a strict ancestor of node `i` is a value field. */
function walkInside(tree: AxTree, i: number): boolean {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null) {
    const node = tree.nodes[at];
    if (node === undefined) return false;
    if (isValueField(node)) return true;
    at = node.parent;
  }
  return false;
}

/**
 * `walkInside` for every node in one pass: a parent comes before its child in text order, so a node's answer is
 * its parent's, or whether the parent is a value field. A node whose parent comes later is walked.
 */
function insideFlags(tree: AxTree): readonly boolean[] {
  const known = insideMemo.get(tree);
  if (known !== undefined) return known;
  const flags: boolean[] = new Array<boolean>(tree.nodes.length);
  for (let i = 0; i < tree.nodes.length; i += 1) {
    const p = tree.nodes[i]?.parent ?? null;
    const parent = p === null ? undefined : tree.nodes[p];
    if (p === null || parent === undefined) flags[i] = false;
    else flags[i] = p < i ? isValueField(parent) || flags[p]! : walkInside(tree, i);
  }
  insideMemo.set(tree, flags);
  return flags;
}

/** Whether a strict ancestor of node `i` is a value field. */
export function insideValueField(tree: AxTree, i: number): boolean {
  return insideFlags(tree)[i] ?? false;
}

/** Node `root` and its descendants, in text order. */
export function subtree(tree: AxTree, root: number): number[] {
  const out: number[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const at = stack.pop()!;
    const node = tree.nodes[at];
    if (node === undefined) continue;
    out.push(at);
    for (let k = node.children.length - 1; k >= 0; k -= 1) stack.push(node.children[k]!);
  }
  return out;
}

/**
 * The `norm`ed names under `root` joined by spaces, with a name equal to the one before it dropped (a cell, its
 * button and the button's StaticText often repeat one word). `staticOnly` keeps StaticText alone.
 * Values never count, nor anything inside a value field.
 */
export function subtreeText(tree: AxTree, root: number, opts: { staticOnly?: boolean } = {}): string {
  const parts: string[] = [];
  for (const at of subtree(tree, root)) {
    const node = tree.nodes[at]!;
    if (opts.staticOnly && node.role !== 'StaticText') continue;
    if (insideValueField(tree, at)) continue;
    const name = norm(node.name);
    if (name !== '' && name !== parts[parts.length - 1]) parts.push(name);
  }
  return parts.join(' ');
}

/**
 * What was typed into text fields, whole and line by line, `norm`ed and longest first: an editable region's
 * text also shows in the body text, and must be cut out of it. A combobox value is a picked option, not typing.
 */
export function typedValues(tree: AxTree): string[] {
  const out = new Set<string>();
  for (const node of tree.nodes) {
    if (node.value === null || !isValueField(node) || node.role === 'combobox') continue;
    for (const piece of [node.value, ...node.value.split(/\r?\n/)]) {
      const value = norm(piece);
      if (Array.from(value).length >= 3) out.add(value);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}
