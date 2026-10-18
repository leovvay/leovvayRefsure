import { performance } from 'node:perf_hooks';
import type { OrcaRun } from './orca-run';
import type { OrcaReply } from './orca-reply';
import { rpcFor, socketOnly } from './orca-rpc-map';
import { orcaVerb, runOrca } from './orca-runner';
import { chooseOrcaTransport } from './runtime-lookup';
import { callRuntime } from './runtime-wire';

// The CLI's own `orca status` gives the runtime this long to answer.
const STATUS_TIMEOUT_MS = 1_000;
/** A socket-only call (`socketOnly`) with no socket to take it: refused here, before anything is sent. */
export const NEEDS_SOCKET: OrcaReply = { ok: false, code: 'invalid_argument', message: 'mouse click needs the runtime socket' };

/**
 * Spec 2026-10-17 §2.3: each call goes over Orca's runtime socket as the method and params the CLI handler would
 * send, and through the `orca` CLI when the socket cannot take it: no metadata, no unix transport, a connection that
 * failed before the request was written, `REFSURE_ORCA_TRANSPORT=cli`, or an argv the map leaves to the CLI. The
 * reply has the CLI's shape either way. `onSpawn` fires once the request is written, or once the CLI process exists.
 * A socket-only call never reaches the CLI: without the socket it is `NEEDS_SOCKET`, and `onSpawn` never fires.
 */
export function createOrcaRun(bin: string | null, env: NodeJS.ProcessEnv, childEnv: NodeJS.ProcessEnv): OrcaRun {
  return async (args, timeoutMs, onSpawn) => {
    const choice = chooseOrcaTransport(env);
    const only = socketOnly(args);
    if (choice.kind === 'socket') {
      const rpc = rpcFor(args);
      // A refusal the CLI prints before it connects: nothing is sent, so `onSpawn` never fires.
      if (rpc !== null && 'ok' in rpc) return rpc;
      if (rpc !== null) {
        const reply = await callRuntime(choice.endpoint, rpc, { timeoutMs, verb: orcaVerb(args), onWritten: onSpawn });
        if (reply !== null) return reply;
      }
    }
    if (only) return NEEDS_SOCKET;
    return runOrca(bin, args, { env: childEnv, timeoutMs, onSpawn });
  };
}

/**
 * The transport for doctor: `socket` with the path and how fast `status.get` answered on it, or `cli` and why.
 * Never throws, and never names the token.
 */
export async function describeOrcaTransport(env: NodeJS.ProcessEnv): Promise<string> {
  const choice = chooseOrcaTransport(env);
  if (choice.kind === 'cli') return `cli: ${choice.why}; every call spawns orca`;
  const { socketPath } = choice.endpoint;
  const started = performance.now();
  try {
    const reply = await callRuntime(choice.endpoint, { method: 'status.get', params: {} }, {
      timeoutMs: STATUS_TIMEOUT_MS, verb: 'status',
    });
    const ms = Math.round(performance.now() - started);
    if (reply === null) return `cli: the runtime socket ${socketPath} refused the connection; each call spawns orca`;
    if (!reply.ok) return `socket ${socketPath}: status.get answered ${reply.code} in ${ms} ms`;
    return `socket ${socketPath}: status.get answered in ${ms} ms`;
  } catch {
    return `socket ${socketPath}: status.get gave no answer within ${STATUS_TIMEOUT_MS} ms`;
  }
}
