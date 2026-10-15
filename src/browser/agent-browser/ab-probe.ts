import type { BackendHealth } from '../backend-health';
import { boundDetail } from '../bound-detail';
import { isBrowserError } from '../browser-error';
import type { AbProbeDeps } from './ab-probe-deps';
import { NO_BINARY, READ_TIMEOUT_MS } from './ab-runner';
import { readSessions } from './ab-sessions';

const VERSION = /agent-browser\s+v?(?<version>\d+\.\d+\.\d+\S*)/i;

/**
 * The binary, its version and the open sessions. `running` means agent-browser answered; `ok` also needs one open
 * session, since refsure drives only a session the user opened. Never throws: doctor reads `problem`.
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
  let sessions: string[];
  try {
    const reply = await deps.run(['session', 'list'], READ_TIMEOUT_MS);
    if (!reply.ok) return { ...health, version, problem: boundDetail(`agent-browser session list: ${reply.message}`) };
    sessions = readSessions(reply.result);
  } catch (error) {
    const detail = isBrowserError(error) ? `${error.code}: ${error.detail}` : 'agent-browser session list failed';
    return { ...health, version, problem: detail };
  }
  const features = [...deps.features()];
  const listed = sessions.length > 0 ? `open sessions: ${sessions.join(', ')}` : 'no session is open';
  const problem = sessions.length > 0
    ? null
    : 'no agent-browser session is open: open one (agent-browser --session <name> open <url>) and pass --page <name>';
  return { ...health, ok: problem === null, version, running: true, features, problem, detail: listed };
}
