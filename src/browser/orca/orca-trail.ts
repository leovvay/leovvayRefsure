import type { PageRef } from '../page-ref';
import type { TrailRecorder } from '../trail-recorder';
import type { OrcaReply } from './orca-reply';
import { rpcFor } from './orca-rpc-map';
import type { OrcaRun } from './orca-run';
import type { RpcRequest } from './rpc-request';
import { chooseOrcaTransport } from './runtime-lookup';
import { callRuntime } from './runtime-wire';
import { pageArgs } from './worktree-guard';

/**
 * A standalone draw's whole budget. Measured on Orca 1.4.230 over the runtime socket on a real tab: a tiny `eval`
 * answered in p50 0.37 ms, p95 0.94 ms (n=30); a whole draw (the 16 KB page script, 12 rows and an arm) right after a
 * snapshot, as before an act, in p50 3.1 ms, p95 3.6 ms (n=20), 1.2 ms of it in the page. The deadline bounds only
 * a stuck tab (a dialog holds every eval in Orca's tab queue), and with it how long the process may outlive its act.
 */
export const TRAIL_TIMEOUT_MS = 300;

/** `browser.eval` of `expression` on `page`, with the very params the `orca eval` handler would send. */
function evalRequest(page: PageRef, env: NodeJS.ProcessEnv, expression: string): RpcRequest | null {
  const rpc = rpcFor(['eval', `--expression=${expression}`, ...pageArgs(page, env)]);
  return rpc !== null && !('ok' in rpc) ? rpc : null;
}

/**
 * Null when a draw can go out (the runtime socket is there), else why not, for doctor. A draw never takes the CLI:
 * an `orca eval` process costs about 115 ms, and its argv, which `ps` shows, would carry element names.
 */
export function orcaTrailBlocked(env: NodeJS.ProcessEnv): string | null {
  const choice = chooseOrcaTransport(env);
  return choice.kind === 'socket' ? null : choice.why;
}

/**
 * The trail's sender on Orca: one `browser.eval` of `call` straight over the runtime socket (`callRuntime`, never
 * `createOrcaRun`, so it can never fall back to an `orca` process), within `TRAIL_TIMEOUT_MS`. It goes through no
 * `sendOnce` and passes no `onWritten`, so it never counts as an act. The transport is read at each draw, as every
 * call reads it; no socket, a connection refused before the write, a timeout or any other failure drops the draw.
 * The page's own answer (`ok`, `skip:…`, `err:…`) is not read: nothing here depends on it.
 */
export function orcaTrailSend(env: NodeJS.ProcessEnv): (page: PageRef, call: string) => Promise<void> {
  return async (page, call) => {
    try {
      const choice = chooseOrcaTransport(env);
      if (choice.kind !== 'socket') return;
      const rpc = evalRequest(page, env, call);
      if (rpc !== null) await callRuntime(choice.endpoint, rpc, { timeoutMs: TRAIL_TIMEOUT_MS, verb: 'eval' });
    } catch {
      // Dropped: the trail is a view, and the next draw carries every row again.
    }
  };
}

/**
 * `expr` with a draw riding it: the original value is computed first and returned unchanged, whatever the draw
 * does, and a throw inside the draw is caught in the page. The settle's promise is returned as it was, so Orca
 * awaits it as before.
 */
export function riding(expr: string, call: string): string {
  return `(function(){var r=(${expr});try{${call}}catch(e){}return r})()`;
}

/** The pending draw for `page`, or null: a recorder that throws gives no ride, and the eval goes out as it was. */
export function pendingDraw(trail: TrailRecorder | undefined, page: PageRef): string | null {
  if (trail === undefined) return null;
  try {
    return trail.draw(page);
  } catch {
    return null;
  }
}

/**
 * One `eval` of `expr` as `run` would send it (same deadline, same reply, same errors), with `call` riding it only
 * over the socket. A ride carries both forms: when the socket refuses the connection before the write, the plain
 * `expr` goes through `run`, which may take the CLI, so element names never reach a child's argv.
 */
export async function evalRiding(
  deps: { env: NodeJS.ProcessEnv; run: OrcaRun }, page: PageRef, expr: string, call: string | null, timeoutMs: number,
): Promise<OrcaReply> {
  const plain = (): Promise<OrcaReply> => (
    deps.run(['eval', `--expression=${expr}`, ...pageArgs(page, deps.env)], timeoutMs));
  if (call === null) return plain();
  let rpc: RpcRequest | null = null;
  const choice = chooseOrcaTransport(deps.env);
  try {
    if (choice.kind === 'socket') rpc = evalRequest(page, deps.env, riding(expr, call));
  } catch {
    rpc = null;
  }
  if (choice.kind !== 'socket' || rpc === null) return plain();
  return (await callRuntime(choice.endpoint, rpc, { timeoutMs, verb: 'eval' })) ?? plain();
}
