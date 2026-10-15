import type { BrowserCapability } from '../capability';
import type { AbRun } from './ab-run';

export interface AbProbeDeps {
  bin: string | null;
  run: AbRun;
  /** `agent-browser --version`, as text. */
  version: () => Promise<string>;
  features: () => ReadonlySet<BrowserCapability>;
}
