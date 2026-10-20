import type { RunState } from './run-state';
import type { RunStop } from './run-stop';

/** Acts or scrolls in a row that changed nothing end the run. */
const UNCHANGED_MAX = 3;

/**
 * Counts a step that moved the page (an act, a scroll) and ends the run once `UNCHANGED_MAX` in a row changed
 * nothing; a change resets the count.
 */
export function unchangedStop(run: RunState, changed: boolean): RunStop | null {
  run.unchanged = changed ? 0 : run.unchanged + 1;
  if (run.unchanged < UNCHANGED_MAX) return null;
  const detail = `${UNCHANGED_MAX} steps in a row changed nothing on the page`;
  return { verdict: 'no_progress', cause: 'no_progress', detail };
}
