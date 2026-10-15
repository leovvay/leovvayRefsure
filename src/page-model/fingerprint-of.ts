import type { AxNode, AxTree, Ref } from '../browser';
import type { Candidate } from './candidate';
import type { Fingerprint } from './fingerprint';
import { lineOf, pathOf } from './candidate-line';
import { INTERACTIVE_ROLES } from './interactive-roles';
import { nodeAt } from './node-at';
import { norm } from './normalize';
import { groupOf, twinPlaceOf } from './twins';

/** What `act` re-finds node `i` by on a fresh snapshot: role, `norm`ed name, path, 1-based ordinal, group size. */
export function fingerprintOf(tree: AxTree, i: number): Fingerprint {
  const node = nodeAt(tree, i);
  const { ordinal, twins } = twinPlaceOf(tree, i);
  return { role: node.role, name: norm(node.name), path: pathOf(tree, i), ordinal, twins };
}

/**
 * The node a fingerprint names on another snapshot. `gone`: no node has that role, name and path, or the one at
 * the ordinal has no ref. `changed`: the group grew or shrank, so the ordinal no longer means the same element.
 */
export function findByFingerprint(tree: AxTree, fp: Fingerprint): { node: number; ref: Ref } | 'gone' | 'changed' {
  const group = groupOf(tree, fp.role, fp.name, fp.path);
  if (group.length === 0) return 'gone';
  if (group.length !== fp.twins) return 'changed';
  const at = group[fp.ordinal - 1];
  const ref = at === undefined ? null : (tree.nodes[at]?.ref ?? null);
  return at === undefined || ref === null ? 'gone' : { node: at, ref };
}

/** Nodes with a ref and an interactive role, in text order, kept by `filter` when one is given. */
export function candidatesOf(tree: AxTree, filter?: (n: AxNode) => boolean): Candidate[] {
  const out: Candidate[] = [];
  tree.nodes.forEach((node, i) => {
    if (node.ref === null || !INTERACTIVE_ROLES.has(node.role)) return;
    if (filter !== undefined && !filter(node)) return;
    out.push({ ref: node.ref, node: i, line: lineOf(tree, i), fp: fingerprintOf(tree, i) });
  });
  return out;
}
