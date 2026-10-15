import type { RunTrace } from '../../output';

export interface OrcaBrowserOptions {
  /** refsure's own environment: `ORCA_WORKTREE_ID`, `REFSURE_PAGE`, the binary lookup. */
  env: NodeJS.ProcessEnv;
  /** Receives `snapshotTaken` and `dispatched`. */
  trace: RunTrace;
}
