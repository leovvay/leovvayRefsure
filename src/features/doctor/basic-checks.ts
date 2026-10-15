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

/**
 * The backend as `probe()` saw it. Its `problem` also names a missing ORCA_WORKTREE_ID when Orca itself is fine;
 * that one has its own check below, so it does not fail the backend check too.
 */
function backendChecks(backend: string, health: BackendHealth, inTerminal: boolean): DoctorCheck[] {
  const worktreeOnly = !inTerminal && health.running && (health.problem ?? '').includes('ORCA_WORKTREE_ID');
  const runningOk = health.ok || worktreeOnly;
  const version = health.version ? ` ${health.version}` : '';
  return [
    {
      name: `${backend}_binary`,
      ok: health.binary !== null,
      detail: health.binary ?? health.problem ?? `no ${backend} binary found`,
    },
    {
      name: `${backend}_running`,
      ok: runningOk,
      detail: runningOk ? `${backend}${version} is running and ready` : (health.problem ?? `${backend} is not ready`),
    },
    {
      name: 'browser_features',
      ok: true,
      detail: health.features.length > 0 ? health.features.join(', ') : 'none',
    },
  ];
}

function terminalCheck(inTerminal: boolean): DoctorCheck {
  return {
    name: 'orca_terminal',
    ok: inTerminal,
    detail: inTerminal
      ? 'ORCA_WORKTREE_ID is set: page commands target this worktree\'s tabs'
      : 'ORCA_WORKTREE_ID is not set: page commands answer not_in_orca_terminal (exit 24); run refsure in an Orca terminal',
  };
}

/** Phase 1 doctor (spec §6.3): Node, the browser backend's probe, and whether this is an Orca terminal. */
export async function basicChecks(ctx: CommandContext): Promise<DoctorCheck[]> {
  const inTerminal = worktreeSet(ctx.env);
  const health = await ctx.browser.probe();
  return [
    nodeCheck(process.versions.node),
    ...backendChecks(ctx.browser.backend, health, inTerminal),
    terminalCheck(inTerminal),
  ];
}
