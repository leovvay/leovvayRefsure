import type { RunTrace } from '../../output';

export interface OrcaBrowserOptions {
  /** refsure's own environment: `ORCA_WORKTREE_ID`, `REFSURE_PAGE`, the binary lookup. */
  env: NodeJS.ProcessEnv;
  /** Receives `snapshotTaken` and `dispatched`. */
  trace: RunTrace;
  /** The run's abort: an act whose page was being painted when it fired is not sent. */
  signal?: AbortSignal;
}
