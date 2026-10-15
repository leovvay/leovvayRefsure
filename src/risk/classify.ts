import type { ActAction, AxNode, AxTree } from '../browser';
import { nodeAt } from '../page-model';
import { backsOut, CONFIRMING_ROLES, dialogOf, isConfirmDialog } from './confirm-dialog';
import { maxRisk } from './max-risk';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';
import { findTermAnyReading, findTermEveryReading } from './term-match';

export interface ClassifyOpts {
  /** The tab's URL, for the path rules. */
  url: string;
  action?: ActAction;
  /** `--risk`: it can only raise the class. */
  userRisk?: RiskClass;
}

const READ_ROLES: ReadonlySet<string> = new Set(['link', 'tab', 'treeitem', 'option']);
const FIELD_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select', 'check', 'uncheck']);
const LEXICON_CLASSES = ['money', 'irreversible', 'auth', 'consent'] as const;
const MONEY_PATH = /checkout|payment|billing/i;
const IRREVERSIBLE_PATH = /delete|close-account/i;

/** Rule 1: what the element is, before any word on it counts. A close word must hold in every reading of the name. */
function baseOf(node: AxNode, action: ActAction | undefined): { risk: RiskClass; reason: string } {
  if (action !== undefined && FIELD_ACTIONS.has(action)) return { risk: 'write', reason: 'base:write' };
  if (READ_ROLES.has(node.role)) return { risk: 'read', reason: `base:read:${node.role}` };
  if (node.role === 'button' && findTermEveryReading('dismissClose', node.name) !== null) {
    return { risk: 'read', reason: 'base:read:close' };
  }
  if (node.role === 'button' && node.attrs.expanded !== undefined) return { risk: 'read', reason: 'base:read:expander' };
  return { risk: 'write', reason: 'base:write' };
}

/** The part of the URL the path rules read: path and fragment (a single-page app routes in the fragment). */
function routeOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash}`;
  } catch {
    return url;
  }
}

/**
 * The risk of acting on node `i` (spec §8.5). Rules apply in order and only raise the class; every rule that
 * fired leaves a reason: the base, the lexicon terms (or `lexicon:none`), the confirm dialog, the URL, `--risk`.
 * A term that raises counts in any reading of the name (`readingsOf`: a zero-width character spaced or dropped);
 * a close or cancel word that keeps it calm only when every reading has it.
 */
export function classify(tree: AxTree, i: number, opts: ClassifyOpts): RiskReading {
  const node = nodeAt(tree, i);
  const name = node.name;
  const base = baseOf(node, opts.action);
  let risk = base.risk;
  const reasons = [base.reason];

  let matched = false;
  for (const cls of LEXICON_CLASSES) {
    const hit = findTermAnyReading(cls, name);
    if (hit === null) continue;
    matched = true;
    risk = maxRisk(risk, cls);
    reasons.push(`lexicon:${hit.lang}:${cls}:${hit.term}`);
  }
  // "Cancel subscription" names what it ends. A bare "Cancel" never takes the word from its dialog title or a
  // heading: in "Delete account?" it backs out (spec §8.5: never a confirm dialog's Cancel/No).
  const cancel = findTermAnyReading('cancelVerbs', name);
  if (cancel !== null) {
    const context = findTermAnyReading('cancelContext', name);
    if (context !== null) {
      matched = true;
      risk = maxRisk(risk, 'irreversible');
      reasons.push(`lexicon:${cancel.lang}:irreversible:${cancel.term}+${context.term}`);
    }
  }
  if (!matched) reasons.push('lexicon:none');

  const clicks = opts.action === undefined || !FIELD_ACTIONS.has(opts.action);
  const dialog = clicks && CONFIRMING_ROLES.has(node.role) ? dialogOf(tree, i) : null;
  if (dialog !== null && isConfirmDialog(tree, dialog) && !backsOut([name])) {
    risk = maxRisk(risk, 'irreversible');
    reasons.push('dialog:confirm');
  }

  const route = routeOf(opts.url);
  const money = MONEY_PATH.exec(route);
  if (money !== null) {
    risk = maxRisk(risk, 'money');
    reasons.push(`url:${money[0].toLowerCase()}`);
  }
  const gone = IRREVERSIBLE_PATH.exec(route);
  if (gone !== null) {
    risk = maxRisk(risk, 'irreversible');
    reasons.push(`url:${gone[0].toLowerCase()}`);
  }

  if (opts.userRisk !== undefined) {
    risk = maxRisk(risk, opts.userRisk);
    reasons.push('user:--risk');
  }
  return { class: risk, reasons };
}
