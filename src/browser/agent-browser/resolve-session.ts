import { BrowserError } from '../browser-error';
import { namedPage } from '../named-page';
import type { PageHint } from '../page-hint';
import type { PageRef } from '../page-ref';
import type { SessionState } from './ab-session-state';

/** agent-browser's own default session name, used when neither `--page` nor `REFSURE_PAGE` names one. */
const DEFAULT_SESSION = 'default';
// A session name goes to agent-browser as one argv word after `--session`: never one that reads as a flag.
const SESSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function checkedSession(name: string): string {
  if (!SESSION_NAME.test(name)) {
    throw new BrowserError('no_tab', `not an agent-browser session name: ${JSON.stringify(name.slice(0, 64))}`);
  }
  return name;
}

/**
 * The page of the agent-browser backend is a session: `--page`, then `REFSURE_PAGE`, then `default`. There is no
 * worktree guard. The session's browser must already be running (`state`), because any page call on a session
 * without one makes agent-browser launch a new browser, and refsure never launches one.
 */
export async function resolveSession(
  hint: PageHint,
  env: NodeJS.ProcessEnv,
  /** The session as agent-browser reports it, asked without launching anything; injected so only the adapter spawns. */
  state: (session: string) => Promise<SessionState>,
): Promise<PageRef> {
  const session = checkedSession(namedPage(hint, env) ?? DEFAULT_SESSION);
  const now = await state(session);
  if (now !== 'running') throw sessionGone(session, now);
  return { backend: 'agent-browser', id: session };
}

/** `no_tab` for a session whose browser is not running, naming what refsure saw; nothing was launched or sent. */
export function sessionGone(session: string, state: Exclude<SessionState, 'running'>): BrowserError {
  const reopen = `open it again (agent-browser --session ${session} open <url>), or name another with --page`;
  const detail: Record<typeof state, string> = {
    closed: `no agent-browser session "${session}" is open: ${reopen}`,
    no_browser: `agent-browser session "${session}" is listed, but its browser is not running; refsure never `
      + `starts one: ${reopen}`,
    launched: `the browser of agent-browser session "${session}" went away during the call, and agent-browser `
      + `started a new one to answer it; refsure discarded that answer: ${reopen}`,
  };
  return new BrowserError('no_tab', detail[state]);
}
