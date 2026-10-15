import type { ActAction, AxNode, AxTree } from '../browser';
import { classify } from './classify';
import { maxRisk } from './max-risk';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';

export interface NameClassifyOpts {
  /** The tab's URL, for the path rules. */
  url: string;
  action: ActAction;
  /** `--risk`: it can only raise the class. */
  userRisk?: RiskClass;
  /** The element's explicit `role` attribute, when it has one; else a role is taken from the action. */
  role?: string | null;
}

// What an element acted on this way usually is, when no snapshot says. Fields are `write` by base anyway.
const ROLE_OF: Readonly<Record<ActAction, string>> = {
  click: 'button',
  dblclick: 'button',
  fill: 'textbox',
  select: 'combobox',
  check: 'checkbox',
  uncheck: 'checkbox',
};

/** The role an element acted on this way is taken to have when nothing better is known. */
export function actionRole(action: ActAction): string {
  return ROLE_OF[action];
}

function lone(role: string, name: string): AxTree {
  const node: AxNode = { i: 0, depth: 0, role, name, ref: null, attrs: {}, value: null, parent: null, children: [] };
  return { origin: '', pageId: '', nodes: [node], dropped: 0 };
}

/**
 * The risk of acting on a live ref known only by its names (spec §8.3 live-ref path: no snapshot, path `""`).
 * Each name is classified as a lone node of the given role (base, lexicon, URL and `--risk` rules); the class is
 * the highest, the reasons every rule that fired, once each. No names reads as one empty name: `lexicon:none`.
 */
export function classifyNames(names: readonly string[], opts: NameClassifyOpts): RiskReading {
  const role = opts.role && opts.role.trim() !== '' ? opts.role.trim().toLowerCase() : ROLE_OF[opts.action];
  const readings = (names.length > 0 ? names : ['']).map((name) => classify(lone(role, name), 0, {
    url: opts.url,
    action: opts.action,
    ...(opts.userRisk === undefined ? {} : { userRisk: opts.userRisk }),
  }));
  const reasons = [...new Set(readings.flatMap((reading) => reading.reasons))];
  // One `lexicon:none` among real hits says nothing; keep it only when no name matched any term.
  const hits = reasons.filter((reason) => reason.startsWith('lexicon:') && reason !== 'lexicon:none');
  const kept = hits.length > 0 ? reasons.filter((reason) => reason !== 'lexicon:none') : reasons;
  return { class: maxRisk(...readings.map((reading) => reading.class)), reasons: kept };
}
