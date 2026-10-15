import type { SessionReply } from './ab-session-reply';
import type { SessionState } from './ab-session-state';

/** Session checks and guarded page calls on agent-browser sessions (see ab-session-guard). */
export interface SessionGuard {
  /** The session as agent-browser reports it, asked without launching a browser. */
  state(session: string): Promise<SessionState>;
  /** Runs `verbs` on a running session; a session that is not running throws `no_tab` before anything is spawned. */
  call(
    session: string, verbs: readonly (readonly string[])[], timeoutMs: number, onSpawn?: () => void,
  ): Promise<SessionReply>;
}
