import type { DismissLevelReport } from '../dismiss';
import type { RunStepReport } from './run-step-report';

/**
 * How `run` ended (design 2026-10-17 §3): `seen` when the expectation or the `--text` literal showed in the new
 * text; `done_unconfirmed` when the Decision said DONE with nothing to confirm it; `blocked` when it said no
 * operation can make progress; `no_progress` when acts changed nothing; `budget` at `--max-steps` or `--timeout`;
 * `refused` at a guard (high risk, the veto); `low_confidence` when a pick was under its threshold;
 * `decision_unavailable` when a Decision could not be asked or answered; `stopped` when the browser failed, or an
 * act may not have landed, after something acted.
 */
export type RunVerdict =
  | 'seen' | 'done_unconfirmed' | 'blocked' | 'no_progress' | 'budget' | 'refused' | 'low_confidence'
  | 'decision_unavailable' | 'stopped';

/** `refsure run`. `steps`, `dismissed` and `new_text` are page text. */
export interface RunResult {
  verdict: RunVerdict;
  steps: RunStepReport[];
  /** What the blocker level did, or null under `--no-dismiss`. */
  dismissed: DismissLevelReport | null;
  /** Up to 8 lines the page did not show when the run began, the `--fill` values left in. */
  new_text: string[];
  url: string;
  elapsed_ms: number;
  /** Decisions asked: the blocker level's and one per step. */
  decisions: number;
  /** Set whenever something acted and the exit is 30: the stopping cause. */
  unconfirmed?: string;
}
