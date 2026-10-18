import type { ActAction, ActResult } from '../act-result';
import { coveredBy, isRef } from '../agent-browser-format';
import { boundDetail } from '../bound-detail';
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
  return sendAct(deps, [...args, ...pageArgs(page, deps.env)], value);
}

/** A value agent-browser's tokenizer reads as one double-quoted token, and never as a flag. */
const EXEC_VALUE = /^(?!-)[^"\\\u0000-\u001f\u007f]{1,2000}$/;

/**
 * `exec "fill @eN \"value\""`: agent-browser's own fill (focus, select all, insert text, so the field gets the
 * input events typing fires) in one call, where Orca's `fill` makes three (a contenteditable check, a focus, a
 * script). Only for a field the caller knows is no editable region: in one, agent-browser's fill adds to the text
 * instead of replacing it. A value one quoted token cannot carry goes through Orca's `fill`.
 */
export async function fillInputOnOrca(deps: ActDeps, page: PageRef, ref: Ref, value: string): Promise<ActResult> {
  if (!EXEC_VALUE.test(value)) return actOnOrca(deps, page, ref, 'fill', value);
  if (!isRef(ref)) return { kind: 'stale_ref' };
  return sendAct(deps, ['exec', `--command=fill @${ref} "${value}"`, ...pageArgs(page, deps.env)], value);
}

/** One page-changing Orca call, read as `actOnOrca` reads it; `value` is hidden from any detail. */
async function sendAct(deps: ActDeps, args: readonly string[], value?: string): Promise<ActResult> {
  // A failure before the spawn (no binary, not in an Orca terminal) rethrows: nothing was sent.
  const sent = await sendOnce(deps.trace, (onSpawn) => deps.run(args, ACT_TIMEOUT_MS, onSpawn));
  if (sent.kind === 'lost') return { kind: 'unknown', detail: lostDetail(sent.error, 'orca', value) };
  const reply = sent.reply;
  if (reply.ok) return { kind: 'done' };
  // agent-browser refused the click before any input (another element is over its point); Orca passes its answer
  // on as `browser_error`. Like a stale ref, nothing reached the page but a scroll, which no act counts.
  const covered = reply.code === 'browser_error' ? coveredBy(reply.message) : null;
  if (covered !== null) {
    deps.trace.dispatched = sent.before;
    return { kind: 'stale_ref', covered: boundDetail(covered) };
  }
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
 * `focus --element eN`, then `keypress --key=Enter`: Orca sends the key to the page itself, to whatever has focus
 * there, so the element is focused first. A focus Orca refused before touching the page sends nothing more (a gone
 * element is `stale_ref`). From the focus on it counts as dispatched; a failure after that is `unknown`, never
 * retried.
 */
export async function pressEnterOnOrca(deps: ActDeps, page: PageRef, ref: Ref): Promise<ActResult> {
  if (!isRef(ref)) return { kind: 'stale_ref' };
  const focused = await sendAct(deps, ['focus', `--element=${ref}`, ...pageArgs(page, deps.env)]);
  if (focused.kind !== 'done') return focused;
  return sendAct(deps, ['keypress', '--key=Enter', ...pageArgs(page, deps.env)]);
}
