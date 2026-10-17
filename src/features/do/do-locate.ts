import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { candidatesOf } from '../../page-model';
import { type LocateArgs, type LocateResult, type LocateScene, locateOn } from '../locate';
import { nothingDone } from '../shared';
import type { DoStep } from './do-step';

export type Located = CommandOutcome<LocateResult>;

/**
 * A step's target as `locate` takes it: the agent's description as the intent, never the value; risk `write`, so
 * the threshold is the write row and the page can only raise it.
 */
function locateArgs(step: DoStep): LocateArgs {
  return { intent: step.target, recorded: null, risk: 'write', within: null, first: false, top: null };
}

function noCandidates(): Located {
  return nothingDone('abstained', 'none_chosen', 'the page offers no interactive element with a ref', { next: RE_OBSERVE });
}

/** One look: the tab, a snapshot, and the candidates it offers. */
export async function lookAt(ctx: CommandContext, page: PageRef): Promise<LocateScene> {
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  return { page, tab, tree, cands: candidatesOf(tree) };
}

/**
 * Every step's pick on one shared look, in parallel (`locateOn`: code first, else one Decision each), each with its
 * own ticket. Under `--dry-run` one by one, so the run stops at the first Decision request as every verb does.
 */
export async function locateAll(ctx: CommandContext, scene: LocateScene, steps: readonly DoStep[]): Promise<Located[]> {
  if (scene.cands.length === 0) return steps.map(noCandidates);
  if (!ctx.dryRun) return Promise.all(steps.map((step) => locateOn(locateArgs(step), ctx, scene)));
  const located: Located[] = [];
  for (const step of steps) located.push(await locateOn(locateArgs(step), ctx, scene));
  return located;
}

/** One step located again on a fresh look: it may only show after an earlier step, or its element moved. */
export async function locateAgain(ctx: CommandContext, page: PageRef, step: DoStep): Promise<Located> {
  const scene = await lookAt(ctx, page);
  return scene.cands.length === 0 ? noCandidates() : locateOn(locateArgs(step), ctx, scene);
}
