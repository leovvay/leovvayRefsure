import type { AxNode, AxTree } from '../browser';

/** Node `i` of the snapshot; a `RangeError` when it has none. */
export function nodeAt(tree: AxTree, i: number): AxNode {
  const node = tree.nodes[i];
  if (node === undefined) throw new RangeError(`no node ${i} in the snapshot`);
  return node;
}
