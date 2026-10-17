import type { ActAction, ActResult } from '../act-result';
import { isRef } from '../agent-browser-format';
import type { Ref } from '../ax-tree';
import { BrowserError } from '../browser-error';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from '../run-json';
import { actDetail, hideValue, lostDetail, NO_DIALOG, sendOnce } from '../send-once';
import type { Sent } from '../sent';
import type { AbActDeps } from './ab-act-deps';
import { abError, refusedBeforeDispatch } from './ab-error-map';
import type { AbReply } from './ab-reply';
import type { SessionReply } from './ab-session-reply';
import { sessionGone } from './resolve-session';

/**
 * `<verb> @eN [value]` on the session's active tab. From the moment the process exists the act counts as
 * dispatched; only an answer that proves the page was never touched takes that back. A timeout or any other
 * failure after the spawn is `unknown` and is never retried here.
 * The value travels inside a batch's JSON argv array, which agent-browser takes literally: on the command line it
 * read any word it knows as its own flag (`--headed` relaunched the browser headed, `-q` filled nothing), and in a
 * batch `-q`, `--json` and `--ignore-https-errors` were filled as typed (probed live on 0.27).
 */
export async function actOnSession(
  deps: AbActDeps, ref: Ref, action: ActAction, value?: string,
): Promise<ActResult> {
  if (!isRef(ref)) return { kind: 'stale_ref' };
  const verb = [action, `@${ref}`];
  if (action === 'fill' || action === 'select') {
    if (value === undefined) throw new BrowserError('backend_error', `${action} needs a value`);
    verb.push(value);
  }
  return sendVerb(deps, verb, value);
}

/** One page-changing verb on an element, read as `actOnSession` reads it; `value` is hidden from any detail. */
async function sendVerb(deps: AbActDeps, verb: readonly string[], value?: string): Promise<ActResult> {
  const sent = await send(deps, verb, ACT_TIMEOUT_MS);
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'agent-browser', value) };
  const { replies, launched } = sent.reply;
  const reply = replies[0]!;
  if (launched) return launchedAct(deps, reply, sent.before, value);
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.message)) {
    deps.trace.dispatched = sent.before;
    return { kind: 'stale_ref' };
  }
  return { kind: 'unknown', detail: actDetail(`agent-browser: ${reply.message}`, value) };
}

/**
 * `dialog dismiss`: `false` when no dialog is open. Dismissing a dialog changes the page, so it counts as an act.
 * agent-browser dismisses alert and beforeunload dialogs by itself; a confirm or prompt stays for this call.
 */
export async function dismissSessionDialog(deps: AbActDeps): Promise<boolean> {
  const sent = await send(deps, ['dialog', 'dismiss'], READ_TIMEOUT_MS);
  if (sent.kind === 'lost') throw sent.error;
  const { replies, launched } = sent.reply;
  const reply = replies[0]!;
  if (launched) {
    // A browser started during the call holds no dialog of the user's page; nothing of theirs was dismissed.
    if (!reply.ok && NO_DIALOG.test(reply.message)) deps.trace.dispatched = sent.before;
    throw sessionGone(deps.session, 'launched');
  }
  if (reply.ok) return true;
  if (NO_DIALOG.test(reply.message)) {
    deps.trace.dispatched = sent.before;
    return false;
  }
  throw abError(reply.message);
}

/**
 * `focus @eN`, then `press Enter` on the session's active tab: the key goes to whatever has focus in the page, so
 * the element is focused first, in a call of its own (a batch would press after a failed focus too). A gone
 * element is `stale_ref`, and nothing is pressed. Dispatched from the moment the first process exists; a failure
 * after that is `unknown`, never retried. A browser started during the call holds none of the user's page, so the
 * press is reported as possibly landed elsewhere.
 */
export async function pressSessionEnter(deps: AbActDeps, ref: Ref): Promise<ActResult> {
  if (!isRef(ref)) return { kind: 'stale_ref' };
  const focused = await sendVerb(deps, ['focus', `@${ref}`]);
  if (focused.kind !== 'done') return focused;
  const sent = await send(deps, ['press', 'Enter'], ACT_TIMEOUT_MS);
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'agent-browser', undefined) };
  const { replies, launched } = sent.reply;
  const reply = replies[0]!;
  if (launched) return launchedAct(deps, reply, sent.before, undefined);
  if (reply.ok) return { kind: 'done' };
  return { kind: 'unknown', detail: actDetail(`agent-browser: ${reply.message}`, undefined) };
}

/**
 * The act reached a browser agent-browser started during the call, not the page the ref came from. A ref it could
 * not resolve touched nothing (`no_tab`); anything else may have landed on a page a persistent profile restored.
 */
function launchedAct(deps: AbActDeps, reply: AbReply, before: boolean, value: string | undefined): ActResult {
  if (!reply.ok && refusedBeforeDispatch(reply.message)) {
    deps.trace.dispatched = before;
    throw sessionGone(deps.session, 'launched');
  }
  const detail = `the browser of agent-browser session "${deps.session}" went away during the act, and `
    + 'agent-browser started a new one, which received it';
  return { kind: 'unknown', detail: hideValue(detail, value) };
}

// A failure before the spawn (no binary, a session that is not running) rethrows: nothing was sent.
function send(deps: AbActDeps, verb: readonly string[], timeoutMs: number): Promise<Sent<SessionReply>> {
  return sendOnce(deps.trace, (onSpawn) => deps.call([verb], timeoutMs, onSpawn));
}
