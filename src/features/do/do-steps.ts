import type { PageRef } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { type ActCommandResult, runAct } from '../act';
import type { LocateScene } from '../locate';
import type { DoStep } from './do-step';
import type { DoStepReport } from './do-step-report';
import { type Located, locateAgain } from './do-locate';
import type { StepStop } from './step-stop';

/**
 * A pick that may still be found on a later look: no answer good enough, a proposal, or a provider that failed.
 * Twins, a refusal, and a route that will not open stop at once.
 */
const FIND_AGAIN: ReadonlySet<string> = new Set([
  'none_chosen', 'low_confidence', 'disagree', 'proposed_only', 'provider_timeout', 'provider_error',
]);
/** An act whose element moved or left before anything was sent: located again once. */
const MOVED: ReadonlySet<string> = new Set(['ref_gone', 'page_changed']);

/** The steps as run (their reports are filled in place): whether any act was sent, and where they stopped. */
export interface StepsRun { acted: boolean; stop: StepStop | null }

function ticketOf(located: Located): string | null {
  return located.status === 'ok' ? located.result?.ticket ?? null : null;
}

function noted(report: DoStepReport, located: Located): void {
  report.by = located.result?.by ?? null;
  report.element = located.result?.line ?? null;
}

/** The step through `act`'s ticket path: claim, recheck on a fresh snapshot, guard, one typed act; never `--verify`. */
function actOn(ctx: CommandContext, step: DoStep, ticket: string): Promise<CommandOutcome<ActCommandResult>> {
  return runAct({ ticket, action: step.action, value: step.value ?? null, verify: null, page: null }, ctx);
}

/**
 * The acts, in order (spec §2.1 step 4). A step not located up front is located again once on a fresh snapshot,
 * and so is one whose element moved before its act was sent; a second failure stops. Any refusal stops, with the
 * step's own outcome; nothing after it runs. An act that was sent is never sent again.
 */
export async function runSteps(
  ctx: CommandContext, page: PageRef, steps: readonly DoStep[], located: readonly Located[], reports: DoStepReport[],
  looks: LocateScene[],
): Promise<StepsRun> {
  let acted = false;
  for (const [index, step] of steps.entries()) {
    const report = reports[index]!;
    const stop = (outcome: CommandOutcome<unknown>): StepsRun => {
      report.verdict = outcome.acted ? 'unknown' : 'stopped';
      if (outcome.why) report.cause = outcome.why.cause;
      if (outcome.result !== null) report.result = outcome.result;
      return { acted: acted || outcome.acted, stop: { index, outcome } };
    };
    let pick = located[index]!;
    let again = true;
    if (ticketOf(pick) === null && FIND_AGAIN.has(pick.why?.cause ?? '')) {
      pick = await locateAgain(ctx, page, step, looks);
      again = false;
      report.located_again = true;
    }
    noted(report, pick);
    let ticket = ticketOf(pick);
    if (ticket === null) return stop(pick);
    let sent = await actOn(ctx, step, ticket);
    if (sent.status === 'stale' && !sent.acted && again && MOVED.has(sent.why?.cause ?? '')) {
      pick = await locateAgain(ctx, page, step, looks);
      report.located_again = true;
      noted(report, pick);
      ticket = ticketOf(pick);
      if (ticket === null) return stop(pick);
      sent = await actOn(ctx, step, ticket);
    }
    if (sent.status !== 'ok') return stop(sent);
    acted = true;
    report.verdict = 'done';
    report.element = sent.result?.element ?? report.element;
  }
  return { acted, stop: null };
}
