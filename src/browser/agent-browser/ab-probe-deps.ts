import type { BrowserCapability } from '../capability';
import type { AbRun } from './ab-run';
import type { SessionState } from './ab-session-state';

export interface AbProbeDeps {
  bin: string | null;
  run: AbRun;
  /** A listed session's state, asked without launching anything. */
  state: (session: string) => Promise<SessionState>;
  /** `agent-browser --version`, as text. */
  version: () => Promise<string>;
  features: () => ReadonlySet<BrowserCapability>;
}
