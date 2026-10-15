import type { ActAction, ActResult } from '../act-result';
import { isRef } from '../agent-browser-format';
import { boundDetail } from '../bound-detail';
import type { Ref } from '../ax-tree';
import { BrowserError, isBrowserError } from '../browser-error';
import type { AbActDeps } from './ab-act-deps';
import { abError, refusedBeforeDispatch } from './ab-error-map';
import type { AbReply } from './ab-reply';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from './ab-runner';

const NO_DIALOG = /no dialog is showing/i;
// agent-browser reads any argv word it knows as a flag, wherever it stands: a fill value `--headed` relaunched the
// browser headed, and `-q` filled an empty string (probed live). A value that starts with `-` is sent only when it
// reads as a number.
const FLAG_LIKE = /^-(?!\d)/;

/**
 * `<verb> @eN [value]` on the session's active tab. From the moment the process exists the act counts as
 * dispatched; only an answer that proves the page was never touched takes that back. A timeout or any other
 * failure after the spawn is `unknown` and is never retried here.
 */
export async function actOnSession(
  deps: AbActDeps, session: readonly string[], ref: Ref, action: ActAction, value?: string,
): Promise<ActResult> {
  if (!isRef(ref)) return { kind: 'stale_ref' };
  const args = [...session, action, `@${ref}`];
  if (action === 'fill' || action === 'select') {
    if (value === undefined) throw new BrowserError('backend_error', `${action} needs a value`);
    if (FLAG_LIKE.test(value)) {
      const detail = `agent-browser would read a ${action} value that starts with "-" as an option; nothing was sent`;
      throw new BrowserError('backend_error', detail);
    }
    args.push(value);
  }
  const sent = await sendOnce(deps, args, ACT_TIMEOUT_MS);
  if (sent.kind === 'lost') return { kind: 'unknown', detail: hideValue(lostDetail(sent.error), value) };
  const reply = sent.reply;
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
export async function dismissSessionDialog(deps: AbActDeps, session: readonly string[]): Promise<boolean> {
  const sent = await sendOnce(deps, [...session, 'dialog', 'dismiss'], READ_TIMEOUT_MS);
  if (sent.kind === 'lost') throw sent.error;
  const reply = sent.reply;
  if (reply.ok) return true;
  if (NO_DIALOG.test(reply.message)) {
    deps.trace.dispatched = sent.before;
    return false;
  }
  throw abError(reply.message);
}

type Sent = { kind: 'reply'; reply: AbReply; before: boolean } | { kind: 'lost'; error: unknown };

// A failure before the spawn (no binary) rethrows: nothing was sent.
async function sendOnce(deps: AbActDeps, args: readonly string[], timeoutMs: number): Promise<Sent> {
  const before = deps.trace.dispatched;
  let spawned = false;
  try {
    const reply = await deps.run(args, timeoutMs, () => {
      spawned = true;
      deps.trace.dispatched = true;
    });
    return { kind: 'reply', reply, before };
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
