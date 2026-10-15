import { BrowserError } from '../browser-error';
import type { PageHint } from '../page-hint';
import type { PageRef } from '../page-ref';

/** agent-browser's own default session name, used when neither `--page` nor `REFSURE_PAGE` names one. */
export const DEFAULT_SESSION = 'default';
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
 * worktree guard. The session must already be open (`isOpen`), because any call on an unknown session would make
 * agent-browser launch a new browser, and refsure never launches one.
 */
export async function resolveSession(
  hint: PageHint,
  env: NodeJS.ProcessEnv,
  /** Whether agent-browser lists the session as open; injected so only the adapter spawns. */
  isOpen: (session: string) => Promise<boolean>,
): Promise<PageRef> {
  let name: string;
  if (hint.page !== undefined) {
    name = hint.page.trim();
    if (!name) throw new BrowserError('no_tab', '--page is empty');
  } else {
    name = env.REFSURE_PAGE?.trim() || DEFAULT_SESSION;
  }
  const session = checkedSession(name);
  if (!(await isOpen(session))) throw notOpen(session);
  return { backend: 'agent-browser', id: session };
}

export function notOpen(session: string): BrowserError {
  return new BrowserError(
    'no_tab',
    `no agent-browser session "${session}" is open: open it first (agent-browser --session ${session} open <url>), `
      + 'or name another with --page',
  );
}
