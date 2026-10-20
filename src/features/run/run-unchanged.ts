import { headlessRerun } from '../../browser';
import type { RunState } from './run-state';
import type { RunStop } from './run-stop';

/** Acts or scrolls in a row that changed nothing end the run. */
const UNCHANGED_MAX = 3;

/**
 * Counts a step that moved the page (an act, a scroll) and ends the run once `UNCHANGED_MAX` in a row changed
 * nothing; a change resets the count. On Orca the way on is the agent's own headless session, never the tab shown.
 */
export function unchangedStop(run: RunState, changed: boolean, env: NodeJS.ProcessEnv): RunStop | null {
  run.unchanged = changed ? 0 : run.unchanged + 1;
  if (run.unchanged < UNCHANGED_MAX) return null;
  const changedNothing = `${UNCHANGED_MAX} steps in a row changed nothing on the page`;
  // Only Orca's tab can be hidden; agent-browser's headless page takes input wherever it is.
  const detail = run.page.backend === 'orca'
    ? `${changedNothing}: the Orca tab is hidden and takes no input, so nothing reached the page. `
      + headlessRerun(env, run.current.tab.url, 'run').text
    : changedNothing;
  return { verdict: 'no_progress', cause: 'no_progress', detail };
}
