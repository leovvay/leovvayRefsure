import type { BackendHealth } from '../backend-health';
import { boundDetail } from '../bound-detail';
import { isBrowserError } from '../browser-error';
import type { AbProbeDeps } from './ab-probe-deps';
import { NO_BINARY, READ_TIMEOUT_MS } from './ab-runner';
import { readSessions } from './ab-sessions';

const VERSION = /agent-browser\s+v?(?<version>\d+\.\d+\.\d+\S*)/i;

/**
 * The binary, its version and the open sessions. `running` means agent-browser answered; `ok` also needs one
 * session whose browser is running, since refsure drives only a session the user opened. Asking launches nothing.
 * Never throws: doctor reads `problem`.
 */
export async function probeAgentBrowser(deps: AbProbeDeps): Promise<BackendHealth> {
  const health: BackendHealth = {
    ok: false, binary: deps.bin, version: null, running: false, features: [], problem: null, detail: null,
  };
  if (!deps.bin) return { ...health, problem: NO_BINARY };
  let version: string | null = null;
  try {
    version = VERSION.exec(await deps.version())?.groups?.version ?? null;
  } catch {
    // The version is a detail; `session list` below says whether the binary works.
  }
  const live: string[] = [];
  const idle: string[] = [];
  try {
    const reply = await deps.run(['session', 'list'], READ_TIMEOUT_MS);
    if (!reply.ok) return { ...health, version, problem: boundDetail(`agent-browser session list: ${reply.message}`) };
    for (const session of readSessions(reply.result)) {
      ((await deps.state(session)) === 'running' ? live : idle).push(session);
    }
  } catch (error) {
    const detail = isBrowserError(error) ? `${error.code}: ${error.detail}` : 'agent-browser session list failed';
    return { ...health, version, problem: detail };
  }
  const features = [...deps.features()];
  const seen = [
    live.length > 0 ? `open sessions: ${live.join(', ')}` : 'no session has a running browser',
    ...(idle.length > 0 ? [`listed without a running browser (refsure will not use them): ${idle.join(', ')}`] : []),
  ].join('; ');
  const problem = live.length > 0
    ? null
    : 'no agent-browser session has a running browser: open one (agent-browser --session <name> open <url>) and '
      + 'pass --page <name>';
  return { ...health, ok: problem === null, version, running: true, features, problem, detail: seen };
}
