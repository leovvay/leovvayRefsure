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
}
