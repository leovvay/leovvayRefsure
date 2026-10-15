import type { ActAction, ActResult } from '../act-result';
import { isRef } from '../agent-browser-format';
import type { Ref } from '../ax-tree';
import { BrowserError, isBrowserError } from '../browser-error';
import type { PageRef } from '../page-ref';
import { boundDetail, orcaError, refusedBeforeDispatch } from './orca-error-map';
import type { OrcaBrowserOptions } from './orca-browser-options';
import type { OrcaReply } from './orca-reply';
import type { OrcaRun } from './orca-run';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from './orca-runner';
import { pageArgs } from './worktree-guard';

const NO_DIALOG = /no dialog is showing/i;

type ActDeps = OrcaBrowserOptions & { run: OrcaRun };

/**
 * `<verb> --element eN [--value v]`. From the moment the process exists the act counts as dispatched; only an Orca
 * answer that proves the page was never touched takes that back. A timeout or any other failure after the spawn
 * is `unknown` and is never retried here.
 */
export async function actOnOrca(
  deps: ActDeps, page: PageRef, ref: Ref, action: ActAction, value?: string,
): Promise<ActResult> {
  if (!isRef(ref)) return { kind: 'stale_ref' };
  const args = [action, `--element=${ref}`];
  if (action === 'fill' || action === 'select') {
    if (value === undefined) throw new BrowserError('backend_error', `${action} needs a value`);
    args.push(`--value=${value}`);
  }
  args.push(...pageArgs(page, deps.env));
  const sent = await sendOnce(deps, args, ACT_TIMEOUT_MS);
  if (sent.kind === 'lost') return { kind: 'unknown', detail: hideValue(lostDetail(sent.error), value) };
  const reply = sent.reply;
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.code, reply.message)) {
    deps.trace.dispatched = sent.before;
    if (reply.code === 'browser_stale_ref') return { kind: 'stale_ref' };
    throw orcaError(reply.code, hideValue(reply.message, value));
  }
  return { kind: 'unknown', detail: hideValue(boundDetail(`${reply.code}: ${reply.message}`), value) };
}

/** `dialog dismiss`: `false` when no dialog is open. Dismissing a dialog changes the page, so it counts as an act. */
export async function dismissOrcaDialog(deps: ActDeps, page: PageRef): Promise<boolean> {
  const sent = await sendOnce(deps, ['dialog', 'dismiss', ...pageArgs(page, deps.env)], READ_TIMEOUT_MS);
  if (sent.kind === 'lost') throw sent.error;
  const reply = sent.reply;
  if (reply.ok) return true;
  const none = NO_DIALOG.test(reply.message);
  if (none || refusedBeforeDispatch(reply.code, reply.message)) deps.trace.dispatched = sent.before;
  if (none) return false;
  throw orcaError(reply.code, reply.message);
}

type Sent = { kind: 'reply'; reply: OrcaReply; before: boolean } | { kind: 'lost'; error: unknown };

// A failure before the spawn (no binary, not in an Orca terminal) rethrows: nothing was sent.
async function sendOnce(deps: ActDeps, args: readonly string[], timeoutMs: number): Promise<Sent> {
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
  return isBrowserError(error) ? `${error.code}: ${error.detail}` : 'the orca call failed after it started';
}

// Orca may echo a fill value in its error text; the value can be a password.
function hideValue(text: string, value: string | undefined): string {
  return value && value.length > 0 ? text.split(value).join('[value]') : text;
}
