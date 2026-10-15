import type { BrowserPort } from '../../../src/browser';
import type { OrcaTab } from './orca-tab-shape';
import type { PageServer } from './page-server-shape';

/** What one capture uses: refsure's Orca adapter, the harness's tab and page server, the set's root directory. */
export interface CaptureDeps {
  browser: BrowserPort;
  tab: OrcaTab;
  server: PageServer;
  /** The directory the set's page paths are relative to. */
  root: string;
  /** How long a page may run its own scripts (a modal opening on load) before the snapshot. */
  settleMs: number;
  /** The config's PII mask mode, for sites the set does not ask in both modes. */
  piiMasks: boolean;
}
