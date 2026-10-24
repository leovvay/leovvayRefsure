import type { CommandContext } from '../../cli';
import type { TrailWhy } from '../../output';
import { stepSite } from '../../questions';
import type { StepAct } from './step-act-shape';

/**
 * What allowed a step's act, for the in-page trail: the target's own `p` against the risk row the guard held it to
 * (`run-guard`), not the Decision's confidence, which the step reports as its `p`; and the model that read the step.
 * Set on the trace right before the act, which the trail reads once.
 */
export function stepWhy(ctx: CommandContext, act: StepAct, threshold: number | null): TrailWhy {
  const why: TrailWhy = { by: 'decision', site: stepSite.id, p: act.p };
  const model = ctx.trace.decisions.at(-1)?.model;
  if (model !== undefined) why.model = model;
  if (threshold !== null) why.threshold = threshold;
  return why;
}
