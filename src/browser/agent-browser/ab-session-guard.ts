import { BrowserError } from '../browser-error';
import { isRecord } from '../../shared';
import { READ_TIMEOUT_MS } from '../run-json';
import type { AbBatchRun } from './ab-batch-run';
import { abError } from './ab-error-map';
import type { SessionGuard } from './ab-guard';
import type { AbRun } from './ab-run';
import type { SessionReply } from './ab-session-reply';
import type { SessionState } from './ab-session-state';
import { readSessions } from './ab-sessions';
import { sessionGone } from './resolve-session';

const STREAM_STATUS: readonly string[] = ['stream', 'status'];
const UNKNOWN_COMMAND = /^Unknown command\b/i;

/*
  agent-browser launches a browser for any page command on a session that has none: a session with no daemon gets a
  new daemon and a new browser, and a daemon whose browser died (killed, crashed, closed) starts a new one with the
  session's own launch settings. Neither says so in its reply (probed live on 0.27: `get url` answered about:blank).
  Two calls never launch a browser: `session list` reads the socket directory without a daemon, and `stream status`
  reports `connected` (does the daemon hold a live browser) without starting one. (On a daemon that exited a moment
  ago it starts a new, browserless daemon; refsure sets it no idle timeout, since on 0.33+ that would restart every
  running daemon it reaches, so it lives by agent-browser's own default: none on 0.27, 1 h from 0.33.) So every page
  call is checked with both first, and then runs as `batch [stream status, …verbs]`, which repeats the check inside
  the same daemon round trip: a browser that went away between the check and the call shows as `connected: false`.
*/

/** Whether the daemon holds a live browser, from a `stream status` result. */
function connected(result: unknown): boolean {
  return isRecord(result) && result.connected === true;
}

function statusError(message: string): BrowserError {
  if (UNKNOWN_COMMAND.test(message)) {
    return new BrowserError(
      'unsupported',
      'this agent-browser has no `stream status`, so refsure cannot tell whether a session\'s browser is running '
        + 'without starting one; use agent-browser 0.27 or later',
    );
  }
  return abError(message);
}

/** Session checks and guarded calls, bound to one runner. Concurrent checks of one session share one answer. */
export function createSessionGuard(run: AbRun, batch: AbBatchRun): SessionGuard {
  const pending = new Map<string, Promise<SessionState>>();

  async function check(session: string): Promise<SessionState> {
    const listed = await run(['session', 'list'], READ_TIMEOUT_MS);
    if (!listed.ok) throw abError(listed.message);
    if (!readSessions(listed.result).includes(session)) return 'closed';
    const status = await run(['--session', session, ...STREAM_STATUS], READ_TIMEOUT_MS);
    if (!status.ok) throw statusError(status.message);
    return connected(status.result) ? 'running' : 'no_browser';
  }

  // Asked afresh for every call; only calls started while a check is in flight share it.
  function state(session: string): Promise<SessionState> {
    let current = pending.get(session);
    if (!current) {
      current = check(session).finally(() => pending.delete(session));
      pending.set(session, current);
    }
    return current;
  }

  async function call(
    session: string, verbs: readonly (readonly string[])[], timeoutMs: number, onSpawn?: () => void,
  ): Promise<SessionReply> {
    const before = await state(session);
    if (before !== 'running') throw sessionGone(session, before);
    const [head, ...replies] = await batch(['--session', session], [STREAM_STATUS, ...verbs], timeoutMs, onSpawn);
    if (!head) throw new BrowserError('backend_error', 'agent-browser batch answered with no reply');
    // A failed client ran nothing; a failed `stream status` inside the batch cannot vouch for the browser.
    if (replies.length === 0) throw statusError(head.ok ? 'batch ran none of its commands' : head.message);
    return { launched: !(head.ok && connected(head.result)), replies };
  }

  return { state, call };
}
