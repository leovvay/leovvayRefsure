import type { AxTree } from '../../browser';
import { type Candidate, fingerprintOf, fold, lineOf, subtree } from '../../page-model';
import type { FieldOptions } from './field-options';

function optionsUnder(tree: AxTree, root: number): number[] {
  return subtree(tree, root).filter((at) => {
    const node = tree.nodes[at];
    return at !== root && node !== undefined && node.role === 'option' && node.attrs.disabled === undefined;
  });
}

/**
 * The field's options (spec §6.3): the `option` nodes under the field, else under the nearest `listbox` after it
 * in text order. Disabled options are never offered.
 */
export function optionsOf(tree: AxTree, field: number): FieldOptions {
  const inside = optionsUnder(tree, field);
  if (inside.length > 0) return { options: inside, within: 'field' };
  for (let at = field + 1; at < tree.nodes.length; at += 1) {
    if (tree.nodes[at]?.role === 'listbox') return { options: optionsUnder(tree, at), within: 'listbox' };
  }
  return { options: [], within: 'field' };
}

/**
 * An option's label as a select matches it: the accessible name with ASCII whitespace collapsed and trimmed, and
 * nothing else changed (a select compares the label exactly; NFKC could turn it into another string).
 */
export function optionLabel(tree: AxTree, at: number): string {
  return (tree.nodes[at]?.name ?? '').replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '');
}

/** The options whose `fold`ed label equals `fold(label)`: more than one is ambiguous (spec §6.3). */
export function foldTwins(tree: AxTree, options: readonly number[], label: string): number[] {
  const want = fold(label);
  return options.filter((at) => fold(optionLabel(tree, at)) === want);
}

/** Options as candidates, for corroboration. An option without a ref borrows the field's: it is never acted on. */
export function optionCandidates(tree: AxTree, options: readonly number[], fieldRef: Candidate['ref']): Candidate[] {
  return options.map((at) => ({ ref: tree.nodes[at]?.ref ?? fieldRef, node: at, line: lineOf(tree, at), fp: fingerprintOf(tree, at) }));
}
