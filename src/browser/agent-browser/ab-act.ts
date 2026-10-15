import type { ActAction, ActResult } from '../act-result';
import { isRef } from '../agent-browser-format';
import { boundDetail } from '../bound-detail';
import type { Ref } from '../ax-tree';
import { BrowserError, isBrowserError } from '../browser-error';
import type { AbActDeps } from './ab-act-deps';
import { abError, refusedBeforeDispatch } from './ab-error-map';
import type { AbReply } from './ab-reply';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from './ab-runner';
import { sessionGone } from './resolve-session';

const NO_DIALOG = /no dialog is showing/i;

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
  const sent = await sendOnce(deps, verb, ACT_TIMEOUT_MS);
  if (sent.kind === 'lost') return { kind: 'unknown', detail: hideValue(lostDetail(sent.error), value) };
  const reply = sent.reply;
  if (sent.launched) return launchedAct(deps, sent, value);
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.message)) {
    deps.trace.dispatched = sent.before;
    return { kind: 'stale_ref' };
  }
  return { kind: 'unknown', detail: hideValue(boundDetail(`agent-browser: ${reply.message}`), value) };
}

/**
 * `dialog dismiss`: `false` when no dialog is open. Dismissing a dialog changes the page, so it counts as an act.
 * agent-browser dismisses alert and beforeunload dialogs by itself; a confirm or prompt stays for this call.
 */
export async function dismissSessionDialog(deps: AbActDeps): Promise<boolean> {
  const sent = await sendOnce(deps, ['dialog', 'dismiss'], READ_TIMEOUT_MS);
  if (sent.kind === 'lost') throw sent.error;
  const reply = sent.reply;
  if (sent.launched) {
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

type Sent =
  | { kind: 'reply'; reply: AbReply; launched: boolean; before: boolean }
  | { kind: 'lost'; error: unknown };

/**
 * The act reached a browser agent-browser started during the call, not the page the ref came from. A ref it could
 * not resolve touched nothing (`no_tab`); anything else may have landed on a page a persistent profile restored.
 */
function launchedAct(deps: AbActDeps, sent: Extract<Sent, { kind: 'reply' }>, value: string | undefined): ActResult {
  if (!sent.reply.ok && refusedBeforeDispatch(sent.reply.message)) {
    deps.trace.dispatched = sent.before;
    throw sessionGone(deps.session, 'launched');
  }
  const detail = `the browser of agent-browser session "${deps.session}" went away during the act, and `
    + 'agent-browser started a new one, which received it';
  return { kind: 'unknown', detail: hideValue(detail, value) };
}

// A failure before the spawn (no binary, a session that is not running) rethrows: nothing was sent.
async function sendOnce(deps: AbActDeps, verb: readonly string[], timeoutMs: number): Promise<Sent> {
  const before = deps.trace.dispatched;
  let spawned = false;
  try {
    const answer = await deps.call([verb], timeoutMs, () => {
      spawned = true;
      deps.trace.dispatched = true;
    });
    return { kind: 'reply', reply: answer.replies[0]!, launched: answer.launched, before };
  } catch (error) {
    if (!spawned) throw error;
    return { kind: 'lost', error };
  }
}

function lostDetail(error: unknown): string {
  return isBrowserError(error) ? `${error.code}: ${error.detail}` : 'the agent-browser call failed after it started';
}

// agent-browser may echo a fill value in its error text; the value can be a password.
function hideValue(text: string, value: string | undefined): string {
  return value && value.length > 0 ? text.split(value).join('[value]') : text;
}
