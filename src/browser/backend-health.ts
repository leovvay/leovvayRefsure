import type { BrowserCapability } from './capability';

export interface BackendHealth {
  ok: boolean;
  binary: string | null;
  version: string | null;
  running: boolean;
  features: BrowserCapability[];
  problem: string | null;
  /** What else the probe saw, for doctor (the agent-browser backend lists its open sessions). */
  detail?: string | null;
  /**
   * Orca only: whether this terminal names its worktree (`ORCA_WORKTREE_ID`), which page commands need. It is not
   * part of `ok`: Orca can be running and ready while a terminal outside it cannot reach its tabs.
   */
  worktree?: boolean;
}
