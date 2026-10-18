import type { AxNode } from '../ax-tree';

/**
 * Roles a person clicks, types into or picks (page-model's INTERACTIVE_ROLES, repeated here so the parser needs no
 * page-model import). A cursor-clickable node with one of these inside is a wrapper, not a control of its own.
 */
const CONTROLS: ReadonlySet<string> = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'combobox', 'listbox', 'option',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'treeitem', 'slider', 'spinbutton',
]);
const TEXT_MAX = 40;
const CAPTION_MAX = 40;

function textOf(nodes: readonly AxNode[], i: number): string {
  const node = nodes[i]!;
  if (node.role === 'StaticText') return node.name;
  return node.children.map((c) => textOf(nodes, c)).join(' ');
}

function inControl(nodes: readonly AxNode[], i: number): boolean {
  for (let p = nodes[i]!.parent; p !== null; p = nodes[p]!.parent) if (CONTROLS.has(nodes[p]!.role)) return true;
  return false;
}

function hasControl(nodes: readonly AxNode[], i: number): boolean {
  return nodes[i]!.children.some((c) => CONTROLS.has(nodes[c]!.role) || hasControl(nodes, c));
}

/** The text of the last named StaticText or heading sibling before `i` under its parent: a month above its days. */
function captionBefore(nodes: readonly AxNode[], i: number): string | null {
  const p = nodes[i]!.parent;
  if (p === null) return null;
  const siblings = nodes[p]!.children;
  for (let k = siblings.indexOf(i) - 1; k >= 0; k -= 1) {
    const sib = nodes[siblings[k]!]!;
    if ((sib.role === 'StaticText' || sib.role === 'heading') && sib.name.trim() !== '') return sib.name.trim();
    if (sib.ref !== null) return null;
  }
  return null;
}

/**
 * A ref'd node agent-browser found by its cursor (`clickable [cursor:pointer]`) and printed with no name and no
 * control role: a calendar day is a `div` with a click handler, its number a StaticText child. It takes its text as
 * its name, followed by the caption its container comes after (`20 listopada 2026`), so the day is a row and two
 * months' "19" read apart. One with a control inside (a card around its link) or around it (a
 * button's own label) keeps its empty name. Such a node is a row (`candidatesOf`), and risk reads its name as any.
 */
export function nameClickables(nodes: AxNode[]): void {
  for (const node of nodes) {
    if (node.ref === null || node.attrs.clickable !== true || CONTROLS.has(node.role) || node.name.trim() !== '') continue;
    if (hasControl(nodes, node.i) || inControl(nodes, node.i)) continue;
    const text = textOf(nodes, node.i).replace(/\s+/g, ' ').trim();
    if (text === '' || text.length > TEXT_MAX) continue;
    const up = node.parent === null ? null : captionBefore(nodes, node.parent);
    const caption = up !== null && up.length <= CAPTION_MAX ? up : null;
    node.name = caption === null ? text : `${text} ${caption}`;
    node.textNamed = true;
  }
}
