import type { AbReply } from './ab-reply';

/** What one guarded page call on a session answered. */
export interface SessionReply {
  /**
   * True when the session's browser was not running as the call reached the daemon, so agent-browser started one
   * to answer it: the replies come from a browser refsure caused to launch, never the user's page.
   */
  launched: boolean;
  /** One reply per command, in order; fewer when the client failed before running them (none ran then). */
  replies: AbReply[];
}
