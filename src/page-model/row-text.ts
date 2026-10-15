import type { AxTree } from '../browser';
import { pathOf } from './candidate-line';
import { foldVisible } from './normalize';
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

/** `foldVisible`, with no spacing at all: what a `--within` row match compares. */
function bare(s: string): string {
  return foldVisible(s).replace(/\s+/gu, '');
}

/**
 * Whether a row's text holds the `--within` text (spec §8.3): by `fold`, with spacing and invisible characters
 * ignored on both sides. Orca's snapshot text drops a no-break space from every node without a ref, so the row
 * the page shows as "Рахунок 1042" reads `Рахунок1042` here, and the text the agent sees must still find it.
 * An empty `within` matches nothing.
 */
export function rowContains(rowText: string, within: string): boolean {
  const want = bare(within);
  return want !== '' && bare(rowText).includes(want);
}
