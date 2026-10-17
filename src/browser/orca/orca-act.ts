import type { ActAction, ActResult } from '../act-result';
import { isRef } from '../agent-browser-format';
import type { Ref } from '../ax-tree';
import { BrowserError } from '../browser-error';
import type { PageRef } from '../page-ref';
import { ACT_TIMEOUT_MS, READ_TIMEOUT_MS } from '../run-json';
import { actDetail, hideValue, lostDetail, NO_DIALOG, sendOnce } from '../send-once';
import { orcaError, refusedBeforeDispatch, staleRefReply } from './orca-error-map';
import type { OrcaBrowserOptions } from './orca-browser-options';
import type { OrcaRun } from './orca-run';
import { pageArgs } from './worktree-guard';

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
  // A failure before the spawn (no binary, not in an Orca terminal) rethrows: nothing was sent.
  const sent = await sendOnce(deps.trace, (onSpawn) => deps.run(args, ACT_TIMEOUT_MS, onSpawn));
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'orca', value) };
  const reply = sent.reply;
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.code, reply.message)) {
    deps.trace.dispatched = sent.before;
    if (staleRefReply(reply.code, reply.message)) return { kind: 'stale_ref' };
    throw orcaError(reply.code, hideValue(reply.message, value));
  }
  return { kind: 'unknown', detail: actDetail(`${reply.code}: ${reply.message}`, value) };
}

/** `dialog dismiss`: `false` when no dialog is open. Dismissing a dialog changes the page, so it counts as an act. */
export async function dismissOrcaDialog(deps: ActDeps, page: PageRef): Promise<boolean> {
  const args = ['dialog', 'dismiss', ...pageArgs(page, deps.env)];
  const sent = await sendOnce(deps.trace, (onSpawn) => deps.run(args, READ_TIMEOUT_MS, onSpawn));
  if (sent.kind === 'lost') throw sent.error;
  const reply = sent.reply;
  if (reply.ok) return true;
  const none = NO_DIALOG.test(reply.message);
  if (none || refusedBeforeDispatch(reply.code, reply.message)) deps.trace.dispatched = sent.before;
  if (none) return false;
  throw orcaError(reply.code, reply.message);
}

/**
 * `keypress --key=Enter`: Orca sends the key to the page itself, to whatever has focus there. As an act, it counts
 * as dispatched from the moment the request is written; a failure after that is `unknown`, never retried.
 */
export async function pressEnterOnOrca(deps: ActDeps, page: PageRef): Promise<ActResult> {
  const args = ['keypress', '--key=Enter', ...pageArgs(page, deps.env)];
  const sent = await sendOnce(deps.trace, (onSpawn) => deps.run(args, ACT_TIMEOUT_MS, onSpawn));
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'orca', undefined) };
  const reply = sent.reply;
  if (reply.ok) return { kind: 'done' };
  if (refusedBeforeDispatch(reply.code, reply.message)) {
    deps.trace.dispatched = sent.before;
    throw orcaError(reply.code, reply.message);
  }
  return { kind: 'unknown', detail: actDetail(`${reply.code}: ${reply.message}`, undefined) };
}
