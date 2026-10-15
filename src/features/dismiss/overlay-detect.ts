import type { AxTree } from '../../browser';
import { fold, INTERACTIVE_ROLES, insideValueField, norm, subtree } from '../../page-model';
import { findTerm } from '../../risk';

const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);
/** Landmarks a consent banner sits in. Never `banner`: that is the site's own header (spec §6.2). */
const REGION_ROLES: ReadonlySet<string> = new Set(['region', 'complementary']);
/** "Cookie" in the seven languages refsure reads; matched inside words ("cookies", "ciasteczka"). */
const COOKIE_WORDS = /cookie|куки|кукі|ciasteczk|galleta|témoin/u;
const MIN_BUTTONS = 2;

/** Whether a strict ancestor of node `i` below `stop` is a control: a button's own label is not banner wording. */
function underControl(tree: AxTree, i: number, stop: number): boolean {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null && at !== stop) {
    const node = tree.nodes[at];
    if (node === undefined) return false;
    if (INTERACTIVE_ROLES.has(node.role)) return true;
    at = node.parent;
  }
  return false;
}

/** A landmark's own wording: its name and the StaticText outside its controls and fields, `fold`ed. */
function wordingOf(tree: AxTree, root: number): string {
  const parts = [tree.nodes[root]?.name ?? ''];
  for (const at of subtree(tree, root)) {
    const node = tree.nodes[at]!;
    if (node.role !== 'StaticText' || insideValueField(tree, at) || underControl(tree, at, root)) continue;
    parts.push(node.name);
  }
  return fold(parts.map(norm).join(' '));
}

function consentBanner(tree: AxTree, i: number): boolean {
  const buttons = subtree(tree, i).filter((at) => tree.nodes[at]?.role === 'button').length;
  if (buttons < MIN_BUTTONS) return false;
  const wording = wordingOf(tree, i);
  return COOKIE_WORDS.test(wording) || findTerm('consent', wording) !== null;
}

/**
 * The overlay a dismiss works on, by code (spec §6.2): the last `dialog`/`alertdialog` in text order, the topmost
 * one; else the last `region`/`complementary` whose own wording has a cookie word or a consent term and that holds
 * at least two buttons. `null` when there is none.
 */
export function detectOverlay(tree: AxTree): number | null {
  let dialog: number | null = null;
  let region: number | null = null;
  tree.nodes.forEach((node, i) => {
    if (DIALOG_ROLES.has(node.role)) dialog = i;
    else if (REGION_ROLES.has(node.role) && consentBanner(tree, i)) region = i;
  });
  return dialog ?? region;
}
