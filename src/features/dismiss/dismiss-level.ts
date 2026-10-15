import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { causeStatus } from '../../output';
import { type Candidate, candidatesOf, cutName, norm, subtree, subtreeText, twinKey } from '../../page-model';
import { BOUNDS, dismissSite, type Verdict } from '../../questions';
import type { DismissArgs } from './dismiss.args';
import { settleDismissPick } from './dismiss-pick';
import { vetoOf } from './dismiss-veto';
import type { LevelOutcome } from './level-outcome';
import { detectOverlay } from './overlay-detect';

const CONTROL_ROLES: ReadonlySet<string> = new Set(['button', 'link']);
const SNAPSHOT = { do: 'snapshot' as const, argv: ['refsure', 'snap'] };

/** One candidate per twin group, the first in page order: identical lines tell a model nothing apart. */
function distinct(cands: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = twinKey(c.fp.role, c.fp.name, c.fp.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function abstained(level: number, overlay: string, verdict: Extract<Verdict<number>, { kind: 'abstain' }>): LevelOutcome {
  const status = causeStatus(verdict.cause);
  const out: LevelOutcome = {
    report: { level, verdict: status === 'refused' ? 'refused' : 'abstained', overlay, by: 'decision', cause: verdict.cause },
    status,
    why: { cause: verdict.cause, detail: verdict.detail },
    clicked: false,
  };
  if (status === 'abstained') out.next = SNAPSHOT;
  else if (status === 'not_set_up') out.next = { do: 'needs_human' };
  return out;
}

/** The container's buttons and links with a ref, at most 12, one per twin group. */
function controlsOf(tree: AxTree, container: number): Candidate[] {
  const inside = new Set(subtree(tree, container));
  return distinct(candidatesOf(tree, (node) => inside.has(node.i) && CONTROL_ROLES.has(node.role))).slice(0, BOUNDS.DISMISS_MAX);
}

/**
 * One overlay (spec §6.2, §8.4): find it by code; refuse by code when every control is on the never-click list;
 * else ask the dismiss Decision over its controls (v1 lines) with its text as the popup, then settle the pick.
 */
export async function dismissLevel(ctx: CommandContext, page: PageRef, args: DismissArgs, level: number): Promise<LevelOutcome> {
  const [tab, tree]: [TabInfo, AxTree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const container = detectOverlay(tree);
  if (container === null) return { report: { level, verdict: 'no_overlay' }, status: 'ok', clicked: false };
  const box = tree.nodes[container]!;
  const overlay = `${box.role} ${JSON.stringify(cutName(norm(box.name)))}`;
  const controls = controlsOf(tree, container);
  if (controls.length === 0) {
    return {
      report: { level, verdict: 'abstained', overlay, by: 'code', cause: 'none_chosen' },
      status: 'abstained',
      why: { cause: 'none_chosen', detail: 'the overlay has no button or link with a ref to dismiss it by' },
      next: { do: 'needs_human' },
      clicked: false,
    };
  }
  if (controls.every((c) => vetoOf(c.fp.name) !== null)) {
    const names = controls.map((c) => JSON.stringify(cutName(c.fp.name))).join(', ');
    return {
      report: { level, verdict: 'vetoed', overlay, by: 'code', cause: 'veto' },
      status: 'refused',
      why: { cause: 'veto', detail: `every control of the overlay is on the never-click list (${names}); nothing was clicked` },
      next: { do: 'needs_human' },
      clicked: false,
    };
  }
  const lines = controls.map((c) => c.line);
  const decided = await ctx.decide(
    dismissSite,
    { overlay: subtreeText(tree, container), lines },
    { combo: args.agree ? 'agree' : 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
  );
  const { verdict } = decided;
  if (verdict.kind === 'abstain') return abstained(level, overlay, verdict);
  const pick = controls[verdict.value];
  if (pick === undefined) {
    const detail = `answered option ${verdict.index ?? '?'}, which was not offered`;
    return abstained(level, overlay, {
      kind: 'abstain', cause: 'provider_error', detail, leaned: null, confidence: verdict.confidence, threshold: verdict.threshold,
    });
  }
  return settleDismissPick(ctx, { page, tab, tree, container, overlay, level, args }, pick, decided);
}
