import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { type Candidate, candidatesOf, isValueField } from '../../page-model';
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

/** What a box a `--check` or `--uncheck` can set is. */
const CHECKABLE: ReadonlySet<string> = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);
/** A native select shows as a combobox; a listbox takes an option the same way. */
const SELECTABLE: ReadonlySet<string> = new Set(['combobox', 'listbox']);

/** What a step's act can land on: a fill only a field it can type into, and so on. A click takes any candidate. */
const KINDS: Readonly<Record<DoStep['action'], { what: string; fits: (scene: LocateScene, cand: Candidate) => boolean }>> = {
  click: { what: 'interactive element', fits: () => true },
  fill: { what: 'field to type into', fits: (scene, cand) => isValueField(scene.tree.nodes[cand.node]!) },
  select: { what: 'select', fits: (_scene, cand) => SELECTABLE.has(cand.fp.role) },
  check: { what: 'checkbox, radio or switch', fits: (_scene, cand) => CHECKABLE.has(cand.fp.role) },
  uncheck: { what: 'checkbox, radio or switch', fits: (_scene, cand) => CHECKABLE.has(cand.fp.role) },
};

function noCandidates(step: DoStep): Located {
  return nothingDone('abstained', 'none_chosen', `the page offers no ${KINDS[step.action].what} with a ref`, { next: RE_OBSERVE });
}

/**
 * Locate a step only among what its act can land on, so `--fill "Search=…"` never settles on the Search button by
 * its name. The twin groups stay those of the whole page.
 */
function locateStep(ctx: CommandContext, scene: LocateScene, step: DoStep): Promise<Located> {
  const kind = KINDS[step.action];
  const cands = scene.cands.filter((cand) => kind.fits(scene, cand));
  if (cands.length === 0) return Promise.resolve(noCandidates(step));
  return locateOn(locateArgs(step), ctx, { ...scene, cands });
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
  if (!ctx.dryRun) return Promise.all(steps.map((step) => locateStep(ctx, scene, step)));
  const located: Located[] = [];
  for (const step of steps) located.push(await locateStep(ctx, scene, step));
  return located;
}

/** One step located again on a fresh look: it may only show after an earlier step, or its element moved. */
export async function locateAgain(ctx: CommandContext, page: PageRef, step: DoStep): Promise<Located> {
  return locateStep(ctx, await lookAt(ctx, page), step);
}
