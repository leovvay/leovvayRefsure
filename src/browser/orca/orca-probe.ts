import type { BackendHealth } from '../backend-health';
import { isBrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import { boundDetail } from './orca-error-map';
import { ORCA_FEATURES } from './orca-features';
import type { OrcaRun } from './orca-run';
import { READ_TIMEOUT_MS } from './orca-runner';

/** `orca status` plus the binary path and the terminal's `ORCA_APP_VERSION`. Never throws: doctor reads `problem`. */
export async function probeOrca(bin: string | null, env: NodeJS.ProcessEnv, run: OrcaRun): Promise<BackendHealth> {
  const health: BackendHealth = {
    ok: false,
    binary: bin,
    version: env.ORCA_APP_VERSION?.trim() || null,
    running: false,
    features: [...ORCA_FEATURES],
    problem: null,
  };
  if (!bin) return { ...health, problem: 'no orca binary in $ORCA_CLI_BIN_DIR, on PATH, or in /Applications/Orca.app' };
  let reply;
  try {
    reply = await run(['status'], READ_TIMEOUT_MS);
  } catch (error) {
    const detail = isBrowserError(error) ? `${error.code}: ${error.detail}` : 'orca status failed';
    return { ...health, problem: detail };
  }
  if (!reply.ok) return { ...health, problem: boundDetail(`${reply.code}: ${reply.message}`) };
  const result = isRecord(reply.result) ? reply.result : {};
  const app = isRecord(result.app) ? result.app : {};
  const runtime = isRecord(result.runtime) ? result.runtime : {};
  const running = app.running === true && runtime.reachable !== false;
  const version = typeof runtime.appVersion === 'string' ? runtime.appVersion : health.version;
  const state = typeof runtime.state === 'string' ? runtime.state : 'ready';
  const problem = !running
    ? 'Orca is not running: start it with `orca open`'
    : state !== 'ready'
      ? `the Orca runtime is ${state}, not ready`
      : env.ORCA_WORKTREE_ID?.trim()
        ? null
        : 'ORCA_WORKTREE_ID is not set: run refsure from an Orca terminal';
  return { ...health, ok: problem === null, running, version, problem };
}
