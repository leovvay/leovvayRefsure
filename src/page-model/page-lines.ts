import type { AxTree } from '../browser';
import { norm } from './normalize';
import { insideValueField, isValueField } from './tree-text';

/**
 * Nodes whose name is text the page shows, when no StaticText child repeats it: a heading, a link or button label,
 * a cell, an option, an alert. agent-browser leaves out a StaticText child that only repeats its node's name.
 */
const NAMED_TEXT_ROLES: ReadonlySet<string> = new Set([
  'heading', 'link', 'button', 'cell', 'gridcell', 'columnheader', 'rowheader', 'option', 'tab', 'menuitem',
  'menuitemradio', 'menuitemcheckbox', 'listitem', 'alert', 'status', 'checkbox', 'radio', 'switch', 'img', 'dialog',
  'alertdialog', 'region',
]);

/**
 * The page's text as lines, read off one snapshot (no page call): each run of StaticText siblings as one line, and
 * the name of a node that shows text and has no StaticText child (never a row's, which repeats its cells), in text
 * order. Nothing inside or of a value field: what was typed never shows here. A line equal to the one before it is
 * dropped.
 */
export function pageLines(tree: AxTree): string[] {
  const lines: string[] = [];
  let run: { parent: number | null; parts: string[] } | null = null;
  const flush = (): void => {
    if (run === null) return;
    const text = norm(run.parts.join(' '));
    if (text !== '' && text !== lines[lines.length - 1]) lines.push(text);
    run = null;
  };
  tree.nodes.forEach((node, i) => {
    if (isValueField(node) || insideValueField(tree, i)) return;
    if (node.role === 'StaticText') {
      if (run !== null && run.parent !== node.parent) flush();
      run ??= { parent: node.parent, parts: [] };
      run.parts.push(node.name);
      return;
    }
    flush();
    if (!NAMED_TEXT_ROLES.has(node.role)) return;
    const name = norm(node.name);
    const hasText = node.children.some((child) => tree.nodes[child]?.role === 'StaticText');
    if (name !== '' && !hasText && name !== lines[lines.length - 1]) lines.push(name);
  });
  flush();
  return lines;
}
