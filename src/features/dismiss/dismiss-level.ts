import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { NEEDS_HUMAN } from '../../output';
import {
  type Candidate, candidatesOf, cutName, describeElement, distinctByGroup, subtree, subtreeText,
} from '../../page-model';
import { BOUNDS, dismissSite } from '../../questions';
import { type AbstainWhy, abstainOutcome, notOffered } from '../shared';
import type { DismissArgs } from './dismiss.args';
import { guardDismissPick, settleDismissPick } from './dismiss-pick';
import type { DismissScene } from './dismiss-scene';
import { vetoOf } from './dismiss-veto';
import type { LevelOutcome } from './level-outcome';
import { detectOverlay } from './overlay-detect';

const CONTROL_ROLES: ReadonlySet<string> = new Set(['button', 'link']);

/** A Decision that gave no answer: the status and the way on as every abstain gives them (`abstainOutcome`). */
function abstained(level: number, overlay: string, why: AbstainWhy): LevelOutcome {
  const { status, why: said, next } = abstainOutcome(why, null);
  const out: LevelOutcome = {
    report: { level, verdict: status === 'refused' ? 'refused' : 'abstained', overlay, by: 'decision', cause: why.cause },
    status,
    clicked: false,
  };
  if (said) out.why = said;
  if (next) out.next = next;
  return out;
}

/** The container's buttons and links with a ref, at most 12, one per twin group. */
function controlsOf(tree: AxTree, container: number): Candidate[] {
  const inside = new Set(subtree(tree, container));
  return distinctByGroup(candidatesOf(tree, (node) => inside.has(node.i) && CONTROL_ROLES.has(node.role))).slice(0, BOUNDS.DISMISS_MAX);
}

/**
 * One overlay (spec §6.2, §8.4): find it by code; refuse by code when every control is on the never-click list;
 * else ask the dismiss Decision over its controls (v1 lines) with its text as the popup, then settle the pick (or
 * guard Jev's lean when the providers disagreed). `look` is a tab and snapshot the caller has just read, used in
 * place of a fresh pair; the click still finds its pick again on a fresh snapshot.
 */
export async function dismissLevel(
  ctx: CommandContext, page: PageRef, args: DismissArgs, level: number, look?: { tab: TabInfo; tree: AxTree },
): Promise<LevelOutcome> {
  const [tab, tree]: [TabInfo, AxTree] = look
    ? [look.tab, look.tree]
    : await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const container = detectOverlay(tree);
  if (container === null) return { report: { level, verdict: 'no_overlay' }, status: 'ok', clicked: false };
  const box = tree.nodes[container]!;
  const overlay = describeElement(box.role, box.name);
  const controls = controlsOf(tree, container);
  if (controls.length === 0) {
    return {
      report: { level, verdict: 'abstained', overlay, by: 'code', cause: 'none_chosen' },
      status: 'abstained',
      why: { cause: 'none_chosen', detail: 'the overlay has no button or link with a ref to dismiss it by' },
      next: NEEDS_HUMAN,
      clicked: false,
    };
  }
  if (controls.every((c) => vetoOf(tree.nodes[c.node]?.name ?? c.fp.name) !== null)) {
    const names = controls.map((c) => JSON.stringify(cutName(c.fp.name))).join(', ');
    return {
      report: { level, verdict: 'vetoed', overlay, by: 'code', cause: 'veto' },
      status: 'refused',
      why: { cause: 'veto', detail: `every control of the overlay is on the never-click list (${names}); nothing was clicked` },
      next: NEEDS_HUMAN,
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
  const scene: DismissScene = { page, tab, tree, container, overlay, level, args };
  if (verdict.kind === 'abstain') {
    // The twin rule and the guard come before the agreement (spec §8.2 steps 9-11): when the providers disagree, Jev's
    // pick still meets them first, so a vetoed, twinned or high-risk lean names that cause, not `disagree`. A
    // high-risk lean goes to a human, with no act-high-risk command.
    const leaned = verdict.cause === 'disagree' ? verdict.leanedValue : undefined;
    const lean = leaned === undefined ? undefined : controls[leaned];
    if (lean !== undefined) {
      const guarded = await guardDismissPick(ctx, scene, lean, verdict.detail);
      if ('stop' in guarded) return guarded.stop;
    }
    return abstained(level, overlay, verdict);
  }
  const pick = controls[verdict.value];
  if (pick === undefined) return abstained(level, overlay, notOffered(verdict.index));
  return settleDismissPick(ctx, scene, pick, decided);
}
