import type { RunTrace } from '../../output';
import type { TrailRecorder } from '../trail-recorder';

export interface OrcaBrowserOptions {
  /** refsure's own environment: `ORCA_WORKTREE_ID`, `REFSURE_PAGE`, the binary lookup. */
  env: NodeJS.ProcessEnv;
  /** Receives `snapshotTaken` and `dispatched`. */
  trace: RunTrace;
  /** The run's abort: an act whose page was being painted when it fired is not sent. */
  signal?: AbortSignal;
  /** The in-page trail's recorder (`src/trail`); absent or off, nothing is drawn and no method is wrapped. */
  trail?: TrailRecorder;
}
