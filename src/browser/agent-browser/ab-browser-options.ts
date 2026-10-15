import type { RunTrace } from '../../output';

export interface AgentBrowserOptions {
  /** refsure's own environment: `REFSURE_PAGE`, PATH for the binary lookup. */
  env: NodeJS.ProcessEnv;
  /** Receives `snapshotTaken` and `dispatched`. */
  trace: RunTrace;
  /** refsure's state directory, where its empty agent-browser config file lives. */
  stateDir: string;
}
