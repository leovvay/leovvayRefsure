import type { DismissLevelReport } from '../dismiss';
import type { DoStepReport } from './do-step-report';

/**
 * `refsure do`: `done` when every step ran and nothing was expected, `seen` when the expectation showed in the new
 * text, `not_seen` or `stalled` when it did not (never "absent" or "failed"; `not_seen` also when no Decision could
 * be asked, which `why.cause` names), `stopped` when a step or a browser failure stopped it. `steps`, `dismissed`
 * and `new_text` are page text.
 */
export interface DoResult {
  verdict: 'done' | 'seen' | 'not_seen' | 'stalled' | 'stopped';
  steps: DoStepReport[];
  /** What the blocker level did, or null under `--no-dismiss`. */
  dismissed: DismissLevelReport | null;
  /** Up to 8 body lines not on the page before the steps, typed and filled text cut; empty when withheld. */
  new_text: string[];
  /** How many more new lines there were past the 8 in `new_text`, which are only the first ones; absent when none. */
  new_text_more?: number;
  waited_ms: number;
  polls: number;
  /** Provider calls in all: the blocker level, the picks and the wait. */
  decisions: number;
  /** Set whenever something acted and the exit is 30: `not_seen`, `stalled`, or the stopping cause. */
  unconfirmed?: string;
}
