import type { AxTree } from '../browser';
import { pathOf } from './candidate-line';
import { subtreeText } from './tree-text';

// What `--within` reads as a row. Layout tables (`<table>` without table semantics) give `LayoutTableRow`.
const ROW_ROLES: ReadonlySet<string> = new Set(['row', 'LayoutTableRow', 'listitem', 'article', 'group']);

/** The nearest ancestor of node `i` that is a row, list item, article or group; `null` when none. */
export function rowOf(tree: AxTree, i: number): number | null {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null) {
    const node = tree.nodes[at];
    if (node === undefined) return null;
    if (ROW_ROLES.has(node.role)) return at;
    at = node.parent;
  }
  return null;
}

/**
 * The text `--within` is matched against (with `fold`): the nearest row's names and StaticText, or, outside any
 * row, the path plus the node's own StaticText. Never a value, never what was typed into a field.
 */
export function rowTextOf(tree: AxTree, i: number): string {
  if (tree.nodes[i] === undefined) throw new RangeError(`no node ${i} in the snapshot`);
  const row = rowOf(tree, i);
  if (row !== null) return subtreeText(tree, row);
  const own = subtreeText(tree, i, { staticOnly: true });
  return own === '' ? pathOf(tree, i) : `${pathOf(tree, i)} ${own}`;
}
