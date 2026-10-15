import type { BrowserCapability } from './capability';

export interface BackendHealth {
  ok: boolean;
  binary: string | null;
  version: string | null;
  running: boolean;
  features: BrowserCapability[];
  problem: string | null;
}
