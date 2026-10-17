import type { BackendHealth } from '../backend-health';
import { boundDetail } from '../bound-detail';
import { isBrowserError } from '../browser-error';
import { isRecord } from '../../shared';
import { READ_TIMEOUT_MS } from '../run-json';
import { NO_ORCA_BINARY } from './orca-binary';
import { ORCA_FEATURES } from './orca-features';
import type { OrcaRun } from './orca-run';

/**
 * `orca status` plus the binary path, the terminal's `ORCA_APP_VERSION`, whether it names its worktree and which
 * transport the calls take. Never throws: doctor reads `problem`, `worktree` for the terminal check and `transport`.
 */
export async function probeOrca(
  bin: string | null, env: NodeJS.ProcessEnv, run: OrcaRun, transport: () => Promise<string>,
): Promise<BackendHealth> {
  const health: BackendHealth = {
    ok: false,
    worktree: Boolean(env.ORCA_WORKTREE_ID?.trim()),
    transport: await transport(),
    binary: bin,
    version: env.ORCA_APP_VERSION?.trim() || null,
    running: false,
    // Known only once Orca answers as running.
    features: [],
    problem: null,
  };
  if (!bin) return { ...health, problem: NO_ORCA_BINARY };
  let reply;
  try {
    reply = await run(['status'], READ_TIMEOUT_MS);
  } catch (error) {
    return { ...health, problem: isBrowserError(error) ? error.message : 'orca status failed' };
  }
  if (!reply.ok) return { ...health, problem: boundDetail(`${reply.code}: ${reply.message}`) };
  const result = isRecord(reply.result) ? reply.result : {};
  const app = isRecord(result.app) ? result.app : {};
  const runtime = isRecord(result.runtime) ? result.runtime : {};
  const running = app.running === true && runtime.reachable !== false;
  const version = typeof runtime.appVersion === 'string' ? runtime.appVersion : health.version;
  const state = typeof runtime.state === 'string' ? runtime.state : 'ready';
  let problem: string | null = null;
  if (!running) problem = 'Orca is not running: start it with `orca open`';
  else if (state !== 'ready') problem = `the Orca runtime is ${state}, not ready`;
  return { ...health, ok: problem === null, running, version, problem, features: running ? [...ORCA_FEATURES] : [] };
}
