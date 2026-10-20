import type { BackendHealth } from '../backend-health';
import { boundDetail } from '../bound-detail';
import { isBrowserError } from '../browser-error';
import { READ_TIMEOUT_MS } from '../run-json';
import type { AbProbeDeps } from './ab-probe-deps';
import { NO_BINARY } from './ab-runner';
import { readSessions } from './ab-sessions';
import { openCommand, URL_PLACEHOLDER } from './resolve-session';

const VERSION = /agent-browser\s+v?(?<version>\d+\.\d+\.\d+\S*)/i;
/** How many other sessions doctor names; it never sends them anything. */
const OTHERS_SHOWN = 8;

/** The other listed sessions, by name only, bounded. */
function othersLine(others: readonly string[]): string[] {
  if (others.length === 0) return [];
  const shown = others.slice(0, OTHERS_SHOWN).join(', ');
  const more = others.length > OTHERS_SHOWN ? ` and ${others.length - OTHERS_SHOWN} more` : '';
  return [`other sessions (listed, never asked): ${shown}${more}`];
}

/**
 * The binary, its version and the session a page command would drive. `running` means agent-browser answered; `ok`
 * also needs that session's browser running, since refsure drives only a session the agent opened. Only that session
 * gets a `stream status`: other agents' sessions are named from `session list` and never sent a command, so doctor
 * cannot disturb them. Asking launches nothing. Never throws: doctor reads `problem`.
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
  let session: string;
  try {
    session = deps.session();
  } catch (error) {
    return { ...health, version, problem: isBrowserError(error) ? error.detail : 'no agent-browser session name' };
  }
  let listed: string[];
  let state: string;
  try {
    const reply = await deps.run(['session', 'list'], READ_TIMEOUT_MS);
    if (!reply.ok) return { ...health, version, problem: boundDetail(`agent-browser session list: ${reply.message}`) };
    listed = readSessions(reply.result);
    state = listed.includes(session) ? await deps.state(session) : 'closed';
  } catch (error) {
    const problem = isBrowserError(error) ? error.message : 'agent-browser session list failed';
    return { ...health, version, problem };
  }
  const features = [...deps.features()];
  const seen = [`session ${session}: ${state}`, ...othersLine(listed.filter((name) => name !== session))].join('; ');
  const open = openCommand(deps.bin, session).join(' ');
  const problem = state === 'running'
    ? null
    : `session ${session} has no running browser: open it yourself, headless (${open}, with your URL in place of `
      + `${URL_PLACEHOLDER}), or name another with --page`;
  return { ...health, ok: problem === null, version, running: true, features, problem, detail: seen };
}
