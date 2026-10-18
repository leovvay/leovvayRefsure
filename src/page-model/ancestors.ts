import type { AxNode, AxTree } from '../browser';
import { INTERACTIVE_ROLES } from './interactive-roles';

/** The roles that make a modal dialog: what `state` calls blocking, `snap --scope dialog` lists and `dismiss` closes. */
export const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);

/**
 * The nearest strict ancestor of node `i` that `holds`, below `stop` when one is given (the walk ends there,
 * `stop` itself unread); `null` when none.
 */
export function nearestAncestor(
  tree: AxTree, i: number, holds: (node: AxNode) => boolean, stop: number | null = null,
): number | null {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null && at !== stop) {
    const node = tree.nodes[at];
    if (node === undefined) return null;
    if (holds(node)) return at;
    at = node.parent;
  }
  return null;
}

/** Whether node `i` sits inside a frame the snapshot opened (a payment provider's card field). */
export function inFrame(tree: AxTree, i: number): boolean {
  return nearestAncestor(tree, i, (up) => up.role.toLowerCase() === 'iframe') !== null;
}

/** Whether node `i` sits under an interactive control below `stop`: a control's own label is not a container's wording. */
export function underControl(tree: AxTree, i: number, stop: number): boolean {
  return nearestAncestor(tree, i, (node) => INTERACTIVE_ROLES.has(node.role), stop) !== null;
}
