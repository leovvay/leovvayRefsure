import type { CommandContext } from '../../cli';
import { NEEDS_HUMAN } from '../../output';
import { cutName, describeElement, subtree } from '../../page-model';
import { detectOverlay, dismissLevel, type LevelOutcome } from '../dismiss';
import { look, lookOf } from './run-look';
import type { RunLook } from './run-look-shape';
import { recentLine, type RunState } from './run-state';
import type { RunStepReport } from './run-step-report';
import type { RunStop } from './run-stop';

/** Blocker levels a run may take after step 1, each on another overlay. */
const BLOCKERS_MAX = 2;
/** The level `dismiss` runs with no flags: it clicks only a read control with write authority. */
const LEVEL = { propose: false, agree: false, depth: 1 } as const;

/** A level that clicked and may have left its overlay up: the run stops there (exit 30), as `dismiss` would. */
export function levelUnknownStop(level: LevelOutcome): RunStop {
  const stop: RunStop = {
    verdict: 'stopped', cause: level.why?.cause ?? 'effect_unknown',
    detail: level.why?.detail ?? 'the blocker click may have landed', effect: level.effect ?? 'dispatched',
  };
  if (level.next) stop.next = level.next;
  return stop;
}

/**
 * Whether a blocker level may run on the look before step `node` is acted on: blockers are on (no `--no-dismiss`),
 * fewer than `BLOCKERS_MAX` ran, code finds an overlay (`detectOverlay`) that no level has worked on, and node `node`
 * sits inside it.
 */
export function overlayOf(run: RunState, at: RunLook, node: number): boolean {
  if (!run.args.dismiss || run.blockers.length >= BLOCKERS_MAX) return false;
  const box = detectOverlay(at.tree);
  if (box === null) return false;
  const { role, name } = at.tree.nodes[box]!;
  return !run.tried.has(describeElement(role, name)) && subtree(at.tree, box).includes(node);
}

/**
 * The step's pick is on the never-click list and sits in an overlay (`overlayOf`), the Accept of a consent dialog
 * that showed after step 1: nothing is sent to it. One dismiss level, `dismiss`'s own code (its Decision, the veto,
 * the risk at read, write authority only for a close or reject control, the recheck on a fresh snapshot, the
 * overlay-gone check), works on that overlay instead. When it went away, the look that showed it gone is the next
 * step's; else the run stops on the veto, as it did before, the level's way on kept (a ticket it proposed).
 */
export async function vetoedInOverlay(
  ctx: CommandContext, run: RunState, report: RunStepReport, element: { role: string; name: string }, term: string,
): Promise<RunStop | null> {
  report.verdict = 'vetoed';
  run.timing.phase('blocker');
  const level = await dismissLevel(ctx, run.page, LEVEL, 1, run.current);
  run.blockers.push({ ...level.report, at: report.n });
  if (level.report.overlay !== undefined) run.tried.add(level.report.overlay);
  if (level.status === 'effect_unknown') {
    run.acted = true;
    return levelUnknownStop(level);
  }
  const vetoed = `${JSON.stringify(cutName(element.name))} carries "${term}", which is on the never-click list; nothing was sent`;
  if (!(level.clicked && level.status === 'ok')) {
    report.verdict = 'stopped';
    const why = level.why === undefined ? level.report.verdict : `${level.report.verdict}: ${level.why.detail}`;
    return {
      verdict: 'refused', cause: 'veto', status: 'refused', next: level.next ?? NEEDS_HUMAN,
      detail: `${vetoed}. A dismiss level on ${level.report.overlay ?? 'its overlay'} did not close it (${why})`,
    };
  }
  // The click moved focus and closed what was open: as after any act but a TYPE, Enter is no longer offered.
  run.acted = true;
  run.typed = null;
  run.recent.push(recentLine(report, element, 'on the never-click list, so nothing was sent; a dismiss level closed '
    + `${level.report.overlay ?? 'the overlay'} by its close or reject control`));
  run.current = level.tree
    ? lookOf(await ctx.browser.tabInfo(run.page), level.tree, run.hints)
    : await look(ctx, run.page, run.hints);
  return null;
}
