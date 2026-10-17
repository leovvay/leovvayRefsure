import type { AxTree, TabInfo } from '../browser';
import { DIALOG_ROLES } from './ancestors';
import type { PageView } from './page-view-shape';
import { cutName, fold, norm, urlNorm } from './normalize';
import { cutPieces, insideValueField, shortTypedValues, showsAsWord, subtreeText, typedValues } from './tree-text';

const HEADINGS_MAX = 12;
const ALERT_MAX = 300;
/** The body text when a typed text too short to cut out shows in it (spec §7.3: typed text is never sent). */
const TEXT_WITHHELD = '(withheld: this page text shows a short text typed into an editable region, which cannot be '
  + 'cut out, and typed text is never sent)';

/** An alert's name and its StaticText, once each when one already holds the other. */
function alertText(tree: AxTree, i: number): string {
  const name = norm(tree.nodes[i]!.name);
  const inner = subtreeText(tree, i, { staticOnly: true });
  if (name === '' || fold(inner).includes(fold(name))) return inner;
  if (inner === '' || fold(name).includes(fold(inner))) return name;
  return `${name} ${inner}`;
}

/**
 * The `state` input: URL, title, headings, dialogs, alerts and body text. It reads names, never `node.value`, and
 * skips everything inside a value field (see `isValueField`), whose StaticText repeats what was typed. The body
 * text has the typed text cut out, or is withheld when a typed text too short to cut shows in it as a word.
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
    } else if (DIALOG_ROLES.has(node.role)) {
      const name = cutName(norm(node.name));
      dialogs.push(name === '' ? node.role : name);
    } else if (node.role === 'alert' || node.role === 'status') {
      const text = cutName(alertText(tree, i), ALERT_MAX);
      if (text !== '') alerts.add(text);
    }
  });
  const text = cutPieces(bodyText, typedValues(tree));
  const textWithheld = showsAsWord(text, shortTypedValues(tree));
  return {
    url: urlNorm(tab.url),
    title: norm(tab.title),
    headings: [...headings],
    dialogs,
    alerts: [...alerts],
    // Body text per line, `norm`ed, typed field text cut out.
    text: textWithheld ? TEXT_WITHHELD : text,
    textWithheld,
  };
}
