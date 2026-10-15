import type { AxTree, TabInfo } from '../../../src/browser';
import { boundText, cleanEgressText } from '../../../src/egress';
import { detectOverlay, vetoOf } from '../../../src/features/dismiss';
import { stateInput } from '../../../src/features/state';
import {
  type Candidate, candidatesOf, exactNameMatch, pageView, rankCandidates, rowContains, rowTextOf, subtree, subtreeText,
} from '../../../src/page-model';
import { BOUNDS, RESEARCH_STATES } from '../../../src/questions';
import type { FindInput, LocateInput, PageStateInput, PresenceInput } from '../../../src/questions';
import { keyOf } from './gold-map';

/*
  Each site's input built from one live snapshot exactly as its command builds it (locate, dismiss, wait-for,
  state); the commands keep these steps private, so they are restated here and checked against `--dry-run`
  bodies in the live proof. A `code` pick is what the command settles with no Decision.
*/

const CONTROL_ROLES: ReadonlySet<string> = new Set(['button', 'link']);
const BLOCKING_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);

/** One candidate per twin group, the first in page order (locate and dismiss). */
export function distinct(cands: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    if (seen.has(keyOf(c))) return false;
    seen.add(keyOf(c));
    return true;
  });
}

/** The first match when every match is of one twin group; `null` when none, or when they differ. */
function oneGroup(matches: readonly Candidate[]): Candidate | null {
  const first = matches[0];
  if (first === undefined) return null;
  return matches.every((m) => keyOf(m) === keyOf(first)) ? first : null;
}

export type CandidateScene = { cands: readonly Candidate[]; code: Candidate | null; offered: Candidate[] };

/**
 * `locate --intent [--within]` over the page's candidates (`all`, from `tree`): the within filter, the exact-name
 * code pick, then the ranked top 20.
 */
export function findScene(tree: AxTree, all: readonly Candidate[], intent: string, within: string | null): CandidateScene & { input: FindInput } {
  const cands = within === null ? all : all.filter((c) => rowContains(rowTextOf(tree, c.node), within));
  const code = oneGroup(exactNameMatch(cands, intent));
  const offered = rankCandidates(distinct(cands), intent);
  return { cands, code, offered, input: { intent, lines: offered.map((c) => c.line) } };
}

/**
 * `locate --recorded <line> --intent <step intent>` over the page's candidates: the verbatim-line code pick, then
 * the ranked top 20.
 */
export function locateScene(cands: readonly Candidate[], recorded: string, intent: string): CandidateScene & { input: Omit<LocateInput, 'order'> } {
  const code = oneGroup(cands.filter((c) => c.line === recorded));
  const offered = rankCandidates(distinct(cands), intent === '' ? recorded : intent);
  return { cands, code, offered, input: { recorded, intent, lines: offered.map((c) => c.line) } };
}

export type DismissScene =
  | { kind: 'no_overlay' }
  | { kind: 'no_controls'; overlay: number }
  | { kind: 'veto'; overlay: number; inside: Candidate[] }
  | { kind: 'ask'; overlay: number; inside: Candidate[]; offered: Candidate[]; input: { overlay: string; lines: string[] } };

/** `dismiss`, one level: the overlay by code, its buttons and links (≤12, one per twin group), the code veto. */
export function dismissScene(tree: AxTree): DismissScene {
  const overlay = detectOverlay(tree);
  if (overlay === null) return { kind: 'no_overlay' };
  const inside = new Set(subtree(tree, overlay));
  const all = candidatesOf(tree, (node) => inside.has(node.i) && CONTROL_ROLES.has(node.role));
  const offered = distinct(all).slice(0, BOUNDS.DISMISS_MAX);
  if (offered.length === 0) return { kind: 'no_controls', overlay };
  if (offered.every((c) => vetoOf(tree.nodes[c.node]?.name ?? c.fp.name) !== null)) return { kind: 'veto', overlay, inside: all };
  return { kind: 'ask', overlay, inside: all, offered, input: { overlay: subtreeText(tree, overlay), lines: offered.map((c) => c.line) } };
}

/** `wait-for --expect`, one poll with no `--text`/`--url`: the cleaned URL and body text. */
export function presenceInputOf(expectation: string, tab: TabInfo, body: string, masks: boolean): PresenceInput {
  return {
    expectation,
    pageUrl: boundText(cleanEgressText(tab.url, masks), { max: BOUNDS.URL_MAX, inline: true }),
    page: cleanEgressText(body, masks),
  };
}

/** `state`'s code rules: a tab that failed to load, then an open dialog. `null` sends it to the Decision. */
export function pageStateCode(tree: AxTree, tab: TabInfo): 'error_page' | 'blocking_modal' | null {
  if (tab.loadError !== null || tab.certificateFailure !== null) return 'error_page';
  return tree.nodes.some((node) => BLOCKING_ROLES.has(node.role)) ? 'blocking_modal' : null;
}

/** `state --expect`: the page view block over the research state set, in one PII mask mode. */
export function pageStateInputOf(tree: AxTree, tab: TabInfo, body: string, expect: string, masks: boolean): PageStateInput {
  const { pageUrl, page } = stateInput(pageView(tree, tab, body), masks);
  return { pageUrl, page, states: RESEARCH_STATES, expect };
}
