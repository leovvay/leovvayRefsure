import type { AxTree } from '../browser';
import { pathOf } from './candidate-line';
import { nodeAt } from './node-at';
import { foldVisible } from './normalize';
import { subtreeText } from './tree-text';

// What `--within` reads as a row. Layout tables (`<table>` without table semantics) give `LayoutTableRow`.
const ROW_ROLES: ReadonlySet<string> = new Set(['row', 'LayoutTableRow', 'listitem', 'article']);
// A group is a row only when no row above holds it: a button group in a table row holds the row's buttons, never
// its cells, so the row is the table row.
const FALLBACK_ROW_ROLE = 'group';

const rowTextMemo = new WeakMap<AxTree, Map<number, string>>();

/**
 * The nearest ancestor of node `i` that is a row, layout table row, list item or article; else the nearest
 * group; `null` when none.
 */
export function rowOf(tree: AxTree, i: number): number | null {
  let group: number | null = null;
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null) {
    const node = tree.nodes[at];
    if (node === undefined) break;
    if (ROW_ROLES.has(node.role)) return at;
    if (group === null && node.role === FALLBACK_ROW_ROLE) group = at;
    at = node.parent;
  }
  return group;
}

/** A row's text, built once per row node: every candidate in a row reads the same text. */
function rowTextAt(tree: AxTree, row: number): string {
  let known = rowTextMemo.get(tree);
  if (known === undefined) {
    known = new Map();
    rowTextMemo.set(tree, known);
  }
  let text = known.get(row);
  if (text === undefined) {
    text = subtreeText(tree, row);
    known.set(row, text);
  }
  return text;
}

/**
 * The text `--within` is matched against (with `fold`): the nearest row's names and StaticText, or, outside any
 * row, the path plus the node's own StaticText. Never a value, never what was typed into a field.
 */
export function rowTextOf(tree: AxTree, i: number): string {
  nodeAt(tree, i);
  const row = rowOf(tree, i);
  if (row !== null) return rowTextAt(tree, row);
  const own = subtreeText(tree, i, { staticOnly: true });
  return own === '' ? pathOf(tree, i) : `${pathOf(tree, i)} ${own}`;
}

/** `foldVisible`, with no spacing at all: what a `--within` row match compares. */
function bare(s: string): string {
  return foldVisible(s).replace(/\s+/gu, '');
}

// The last row text `rowContains` read: every candidate in one row hands it the same text.
let lastRow: { text: string; bare: string } | null = null;

function bareRow(text: string): string {
  if (lastRow === null || lastRow.text !== text) lastRow = { text, bare: bare(text) };
  return lastRow.bare;
}

/**
 * Whether a row's text holds the `--within` text (spec §8.3): by `fold`, with spacing and invisible characters
 * ignored on both sides. Orca's snapshot text drops a no-break space from every node without a ref, so the row
 * the page shows as "Рахунок 1042" reads `Рахунок1042` here, and the text the agent sees must still find it.
 * An empty `within` matches nothing.
 */
export function rowContains(rowText: string, within: string): boolean {
  const want = bare(within);
  return want !== '' && bareRow(rowText).includes(want);
}
