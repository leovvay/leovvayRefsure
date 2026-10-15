import { chooseBackend } from '../../browser';
import type { BackendHealth } from '../../browser';
import type { CommandContext } from '../../cli';
import type { DoctorCheck } from './doctor-check';

const NODE_MIN_MAJOR = 22;

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split('.')[0]);
  const ok = Number.isInteger(major) && major >= NODE_MIN_MAJOR;
  const detail = ok ? `node ${version}` : `node ${version}: refsure needs node >= ${NODE_MIN_MAJOR}`;
  return { name: 'node', ok, detail };
}

function worktreeSet(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.ORCA_WORKTREE_ID?.trim());
}

/** Which backend drives the browser, and why (spec §5.2; `REFSURE_BACKEND`, the Orca terminal, agent-browser). */
function backendChoiceCheck(env: NodeJS.ProcessEnv): DoctorCheck {
  const choice = chooseBackend(env);
  return { name: 'backend', ok: choice.backend !== null, detail: `${choice.backend ?? 'none'}: ${choice.why}` };
}

/**
 * The backend as `probe()` saw it. Orca's `problem` also names a missing ORCA_WORKTREE_ID when Orca itself is fine;
 * that one has its own check below, so it does not fail the backend check too. agent-browser's `detail` lists the
 * open sessions, which `--page` names.
 */
function backendChecks(backend: string, health: BackendHealth, inTerminal: boolean): DoctorCheck[] {
  const worktreeOnly = !inTerminal && health.running && (health.problem ?? '').includes('ORCA_WORKTREE_ID');
  const runningOk = health.ok || worktreeOnly;
  const version = health.version ? ` ${health.version}` : '';
  const seen = health.detail ? `; ${health.detail}` : '';
  return [
    {
      name: `${backend}_binary`,
      ok: health.binary !== null,
      detail: health.binary ?? health.problem ?? `no ${backend} binary found`,
    },
    {
      name: `${backend}_running`,
      ok: runningOk,
      detail: runningOk
        ? `${backend}${version} is running and ready${seen}`
        : (health.problem ?? `${backend} is not ready`),
    },
    {
      // A backend that is not running could not be asked, so its features are unknown, not the static list.
      name: 'browser_features',
      ok: health.running && health.features.length > 0,
      detail: !health.running
        ? `unknown: ${backend} is not running`
        : health.features.length > 0 ? health.features.join(', ') : 'none',
    },
  ];
}

function terminalCheck(inTerminal: boolean): DoctorCheck {
  return {
    name: 'orca_terminal',
    ok: inTerminal,
    detail: inTerminal
      ? 'ORCA_WORKTREE_ID is set: page commands target this worktree\'s tabs'
      : 'ORCA_WORKTREE_ID is not set: Orca page commands answer not_in_orca_terminal (exit 24); run refsure in an '
        + 'Orca terminal, or drive an agent-browser session instead (REFSURE_BACKEND=agent-browser)',
  };
}

/**
 * Phase 1 doctor (spec §6.3): Node, the chosen backend and its probe, and, for Orca, whether this is an Orca
 * terminal. The agent-browser backend has no worktree guard, so it has no terminal check.
 */
export async function basicChecks(ctx: CommandContext): Promise<DoctorCheck[]> {
  const inTerminal = worktreeSet(ctx.env);
  const health = await ctx.browser.probe();
  const checks = [
    nodeCheck(process.versions.node),
    backendChoiceCheck(ctx.env),
    ...backendChecks(ctx.browser.backend, health, inTerminal),
  ];
  if (ctx.browser.backend === 'orca') checks.push(terminalCheck(inTerminal));
  return checks;
}
