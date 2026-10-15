/**
 * An agent-browser session as refsure sees it before a call: `running` (its daemon holds a live browser), `closed`
 * (no daemon is listed), `no_browser` (a daemon is listed, its browser is gone), or `launched` (it was running at the
 * check and gone by the call, so agent-browser started a new browser to answer).
 */
export type SessionState = 'running' | 'closed' | 'no_browser' | 'launched';
