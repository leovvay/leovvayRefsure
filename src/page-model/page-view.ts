import type { AxTree, TabInfo } from '../browser';
import type { PageView } from './page-view-shape';
import { cutName, fold, norm, urlNorm } from './normalize';
import { insideValueField, subtreeText, typedValues } from './tree-text';

const HEADINGS_MAX = 12;
const ALERT_MAX = 300;

/** An alert's name and its StaticText, once each when one already holds the other. */
function alertText(tree: AxTree, i: number): string {
  const name = norm(tree.nodes[i]!.name);
  const inner = subtreeText(tree, i, { staticOnly: true });
  if (name === '' || fold(inner).includes(fold(name))) return inner;
  if (inner === '' || fold(name).includes(fold(inner))) return name;
  return `${name} ${inner}`;
}

/** Body text per line: `norm`ed, typed field text cut out, blank lines dropped. */
function bodyLines(tree: AxTree, bodyText: string): string {
  const typed = typedValues(tree);
  const lines: string[] = [];
  for (const raw of bodyText.split(/\r?\n/)) {
    let line = norm(raw);
    for (const value of typed) {
      if (line.includes(value)) line = norm(line.split(value).join(' '));
    }
    if (line !== '') lines.push(line);
  }
  return lines.join('\n');
}

/**
 * The `state` input: URL, title, headings, dialogs, alerts and body text. It reads names, never `node.value`, and
 * skips everything inside a textbox, searchbox or combobox, whose StaticText repeats what was typed.
 */
export function pageView(tree: AxTree, tab: TabInfo, bodyText: string): PageView {
  const headings = new Set<string>();
  const dialogs: string[] = [];
  const alerts = new Set<string>();
  tree.nodes.forEach((node, i) => {
    if (insideValueField(tree, i)) return;
    if (node.role === 'heading') {
      const name = cutName(norm(node.name));
      if (name !== '' && headings.size < HEADINGS_MAX) headings.add(name);
    } else if (node.role === 'dialog' || node.role === 'alertdialog') {
      const name = cutName(norm(node.name));
      dialogs.push(name === '' ? node.role : name);
    } else if (node.role === 'alert' || node.role === 'status') {
      const text = cutName(alertText(tree, i), ALERT_MAX);
      if (text !== '') alerts.add(text);
    }
  });
  return {
    url: urlNorm(tab.url),
    title: norm(tab.title),
    headings: [...headings],
    dialogs,
    alerts: [...alerts],
    text: bodyLines(tree, bodyText),
  };
}
