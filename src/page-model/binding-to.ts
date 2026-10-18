import type { ActBinding, AxTree } from '../browser';
import { rowContains } from './row-text';
import { subtreeText } from './tree-text';

/** The binding for a click on an element the guard read as `name`: page text carries it as a row would (`rowContains`). */
export function bindingTo(name: string): ActBinding {
  return { name, carries: (text) => rowContains(text, name) };
}

/**
 * The binding for a click on node `i` of the fresh tree: its name, or for a node the parser named from its text and
 * the caption above it (`textNamed`: `20 listopada 2026`), that text alone (`20`), which is all the element itself
 * shows.
 */
export function bindingOf(tree: AxTree, i: number): ActBinding {
  const node = tree.nodes[i]!;
  const own = node.textNamed === true ? subtreeText(tree, i, { staticOnly: true }) : '';
  return bindingTo(own === '' ? node.name : own);
}
