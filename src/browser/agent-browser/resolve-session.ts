import { BrowserError } from '../browser-error';
import { namedPage } from '../named-page';
import type { PageHint } from '../page-hint';
import type { PageRef } from '../page-ref';
import type { SessionState } from './ab-session-state';

/** agent-browser's own default session name, used when nothing names one and no Orca terminal does either. */
const DEFAULT_SESSION = 'default';
// A session name goes to agent-browser as one argv word after `--session`: never one that reads as a flag.
const SESSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** The placeholder an agent replaces in the `open` command refsure hands over: refsure never picks a URL. */
export const URL_PLACEHOLDER = '<url>';

export function checkedSession(name: string): string {
  if (!SESSION_NAME.test(name)) {
    throw new BrowserError('no_tab', `not an agent-browser session name: ${JSON.stringify(name.slice(0, 64))}`);
  }
  return name;
}

/** Characters of the Orca terminal handle (after `term_`) that name its sessions, as the background-browsing skill does. */
const HANDLE_CHARS = 8;

/**
 * The session when neither `--page` nor `REFSURE_PAGE` names one: `bg-<first 8 of ORCA_TERMINAL_HANDLE without
 * term_>` in an Orca terminal, the prefix the background-browsing skill's `bg-<id>-<rand>-<task>` names start with,
 * so agents in parallel terminals never share one; else `default`. A handle that makes no valid name also falls back
 * to `default`.
 */
export function defaultSession(env: NodeJS.ProcessEnv): string {
  const handle = (env.ORCA_TERMINAL_HANDLE?.trim() ?? '').replace(/^term_/, '').slice(0, HANDLE_CHARS);
  const own = `bg-${handle}`;
  return handle !== '' && SESSION_NAME.test(own) ? own : DEFAULT_SESSION;
}

/** The session this invocation names: `--page`, then `REFSURE_PAGE`, then `defaultSession`. */
export function sessionOf(hint: PageHint, env: NodeJS.ProcessEnv): string {
  return checkedSession(namedPage(hint, env) ?? defaultSession(env));
}

/**
 * The page of the agent-browser backend is a session (`sessionOf`). There is no worktree guard. The session's
 * browser must already be running (`state`), because any page call on a session without one makes agent-browser
 * launch a new browser, and refsure never launches one.
 */
export async function resolveSession(
  hint: PageHint,
  env: NodeJS.ProcessEnv,
  /** The session as agent-browser reports it, asked without launching anything; injected so only the adapter spawns. */
  state: (session: string) => Promise<SessionState>,
  /** The binary refsure drives, named in the `open` command the agent runs; null when there is none. */
  bin: string | null,
): Promise<PageRef> {
  const session = sessionOf(hint, env);
  const now = await state(session);
  if (now !== 'running') throw sessionGone(session, now, bin);
  return { backend: 'agent-browser', id: session };
}

/** The command that opens `session` headless with the very binary refsure drives, so its daemon is the same one. */
export function openCommand(bin: string, session: string, url = URL_PLACEHOLDER): string[] {
  return [bin, '--session', session, 'open', url];
}

/**
 * `no_tab` for a session whose browser is not running, naming what refsure saw; nothing was launched or sent.
 * `next.argv` is the `open` command for the agent to run itself (with its URL): refsure never opens one.
 */
export function sessionGone(
  session: string, state: Exclude<SessionState, 'running'>, bin: string | null,
): BrowserError {
  const argv = bin === null ? null : openCommand(bin, session);
  const how = argv === null ? `agent-browser --session ${session} open ${URL_PLACEHOLDER}` : argv.join(' ');
  const reopen = `if you already opened your own session, pass it with --page instead; else open this one yourself, `
    + `headless (${how}; next.argv, with your URL)`;
  const detail: Record<typeof state, string> = {
    closed: `no agent-browser session "${session}" is open: ${reopen}`,
    no_browser: `agent-browser session "${session}" is listed, but its browser is not running; refsure never `
      + `starts one: ${reopen}`,
    launched: `the browser of agent-browser session "${session}" went away during the call, and agent-browser `
      + `started a new one to answer it; refsure discarded that answer: ${reopen}`,
  };
  return new BrowserError('no_tab', detail[state], argv === null ? undefined : { do: 'open_session', argv });
}
