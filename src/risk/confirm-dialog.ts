import type { AxTree } from '../browser';
import { insideValueField, INTERACTIVE_ROLES } from '../page-model';
import { findTermAnyReading, findTermEveryReading } from './term-match';

const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);
/** What a confirm dialog's confirming control can be: whatever confirms on a click. */
export const CONFIRMING_ROLES: ReadonlySet<string> = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio']);

const memo = new WeakMap<AxTree, Map<number, boolean>>();

/** The nearest `dialog|alertdialog` ancestor of node `i`, or null. */
export function dialogOf(tree: AxTree, i: number): number | null {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null) {
    const node = tree.nodes[at];
    if (node === undefined) return null;
    if (DIALOG_ROLES.has(node.role)) return at;
    at = node.parent;
  }
  return null;
}

/** Whether node `i` sits under an interactive control below `stop`: a button's own label is not dialog wording. */
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

/** The dialog's own wording: its name, its headings and its StaticText, never a control's label or a value. */
function wordingOf(tree: AxTree, dialog: number): string[] {
  const out = [tree.nodes[dialog]!.name];
  const stack = [...tree.nodes[dialog]!.children];
  while (stack.length > 0) {
    const at = stack.pop()!;
    const node = tree.nodes[at];
    if (node === undefined) continue;
    const wording = node.role === 'heading' || node.role === 'StaticText';
    if (wording && !insideValueField(tree, at) && !underControl(tree, at, dialog)) out.push(node.name);
    stack.push(...node.children);
  }
  return out;
}

/**
 * A confirm dialog (spec §8.5): its name, a heading in it or its StaticText carries a confirm cue ("are you
 * sure", "confirm", ...) or an irreversible term ("Delete this invoice?"). Dialog wording mostly has no ref to
 * take spacing from, so the cues are matched spacing-insensitively (`findTermLoose`), in either reading.
 */
export function isConfirmDialog(tree: AxTree, dialog: number): boolean {
  let known = memo.get(tree);
  if (known === undefined) {
    known = new Map();
    memo.set(tree, known);
  }
  const cached = known.get(dialog);
  if (cached !== undefined) return cached;
  const found = wordingOf(tree, dialog).some(hasConfirmCue);
  known.set(dialog, found);
  return found;
}

/**
 * Dialog wording that marks a confirm dialog: a confirm cue ("are you sure", "confirm", ...) or an irreversible
 * term, spacing-insensitive (`findTermLoose`), in either reading. The tree rule and the live raiser both read it.
 */
export function hasConfirmCue(text: string): boolean {
  return findTermAnyReading('confirmCue', text, { loose: true }) !== null
    || findTermAnyReading('irreversible', text, { loose: true }) !== null;
}

/**
 * A control that backs out of a dialog (spec §8.5: never a confirm dialog's Cancel/No): every name it carries is
 * a close or cancel word ("No", "Cancel", "×"), in every reading of it. No names never backs out.
 */
export function backsOut(names: readonly string[]): boolean {
  return names.length > 0 && names.every((name) => findTermEveryReading('dismissClose', name) !== null
    || findTermEveryReading('cancelWords', name) !== null);
}
