import type { RunTrace } from '../output';
import { createAgentBrowser, findAgentBrowserBinary } from './agent-browser';
import type { BackendChoice } from './backend-choice';
import { BrowserError } from './browser-error';
import type { BrowserPort } from './browser-port';
import { createOrcaBrowser } from './orca';

/**
 * `REFSURE_BACKEND=orca|agent-browser` decides. Without it: an Orca terminal (`ORCA_WORKTREE_ID`) drives Orca;
 * elsewhere an agent-browser binary (on PATH, else the one Orca bundles) drives agent-browser sessions; with
 * neither, Orca, which then answers `not_in_orca_terminal`.
 */
export function chooseBackend(env: NodeJS.ProcessEnv): BackendChoice {
  const raw = env.REFSURE_BACKEND?.trim() ?? '';
  const named = raw.toLowerCase();
  if (named === 'orca' || named === 'agent-browser') return { backend: named, why: `REFSURE_BACKEND=${named}` };
  if (named !== '') {
    const why = `REFSURE_BACKEND=${JSON.stringify(raw.slice(0, 40))} names no backend: use orca or agent-browser`;
    return { backend: null, why };
  }
  if (env.ORCA_WORKTREE_ID?.trim()) return { backend: 'orca', why: 'ORCA_WORKTREE_ID is set: an Orca terminal' };
  const found = findAgentBrowserBinary(env);
  if (found) return { backend: 'agent-browser', why: `ORCA_WORKTREE_ID is not set, and agent-browser is at ${found}` };
  const why = 'ORCA_WORKTREE_ID is not set and no agent-browser binary was found: page commands answer '
    + 'not_in_orca_terminal';
  return { backend: 'orca', why };
}

/** The port for this invocation, per `chooseBackend`. `stateDir` holds the agent-browser backend's empty config. */
export function createBrowser(opts: { env: NodeJS.ProcessEnv; trace: RunTrace; stateDir: string }): BrowserPort {
  const choice = chooseBackend(opts.env);
  if (choice.backend === 'agent-browser') return createAgentBrowser(opts);
  if (choice.backend === 'orca') return createOrcaBrowser(opts);
  return unknownBackend(choice.why);
}

/**
 * A port for a `REFSURE_BACKEND` typo: nothing runs, and every page call, and any question about capabilities,
 * answers `backend_unknown` (not_set_up, exit 23), which a retry cannot fix. `backend` is only a placeholder.
 */
function unknownBackend(why: string): BrowserPort {
  const refuse = (): never => {
    throw new BrowserError('backend_unknown', why);
  };
  const fail = async (): Promise<never> => refuse();
  return {
    backend: 'orca',
    probe: async () => ({ ok: false, binary: null, version: null, running: false, features: [], problem: why }),
    features: refuse,
    resolvePage: fail,
    tabInfo: fail,
    snapshot: fail,
    text: fail,
    act: fail,
  };
}
