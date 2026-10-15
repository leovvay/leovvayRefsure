import type { RunTrace } from '../../output';
import type { SessionReply } from './ab-session-reply';

/** What an act on a session needs: the session, its guarded call, and the trace that records the dispatch. */
export interface AbActDeps {
  session: string;
  /** `SessionGuard.call`, bound to `session`. */
  call: (verbs: readonly (readonly string[])[], timeoutMs: number, onSpawn?: () => void) => Promise<SessionReply>;
  trace: RunTrace;
}
