import { chooseBackend } from '../../browser';
import type { BackendChoice, BackendHealth, PageHint } from '../../browser';
import type { CommandContext } from '../../cli';
import { orcaTrailStatus } from '../../trail';
import type { DoctorCheck } from './doctor-check';

const NODE_MIN_MAJOR = 22;

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split('.')[0]);
  const ok = Number.isInteger(major) && major >= NODE_MIN_MAJOR;
  const detail = ok ? `node ${version}` : `node ${version}: refsure needs node >= ${NODE_MIN_MAJOR}`;
  return { name: 'node', ok, detail };
}

/**
 * Which backend drives the browser, and where the choice came from (spec §5.2): `REFSURE_BACKEND` when set, else the
 * default (Orca in an Orca terminal; elsewhere agent-browser where a binary is found, else Orca).
 */
function backendChoiceCheck(choice: BackendChoice): DoctorCheck {
  return { name: 'backend', ok: choice.backend !== null, detail: `${choice.backend ?? 'none'}: ${choice.why}` };
}

/**
 * The backend as `probe()` saw it. Orca's worktree is not part of it: the terminal check below reads `worktree`.
 * agent-browser's `detail` names the one session it asked (`--page`, `REFSURE_PAGE`, the default) and lists the others.
 */
function backendChecks(backend: string, health: BackendHealth): DoctorCheck[] {
  const runningOk = health.ok;
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
 * Which wire the Orca calls take (spec 2026-10-17 §2.3). Both work, so it never fails: `cli` only costs a process
 * per call, and the detail says why the socket was not used.
 */
function transportCheck(transport: string): DoctorCheck {
  return { name: 'orca_transport', ok: true, detail: transport };
}

/**
 * Whether refsure draws its own steps in the agent's Orca tab (the trail), and why not when it does not. A view for
 * the human only: every command works the same without it, so it never fails.
 */
function trailCheck(env: NodeJS.ProcessEnv): DoctorCheck {
  return { name: 'trail', ok: true, detail: orcaTrailStatus(env) };
}

/**
 * The Node and backend checks (spec §6.3): Node, the chosen backend and its probe, and, for Orca, whether this is
 * an Orca terminal and which transport its calls take; then the trail. The agent-browser backend has no worktree
 * guard, so it has no terminal check. With no backend chosen (a `REFSURE_BACKEND` typo), only the failed choice is
 * shown: there is no backend to probe.
 */
export async function basicChecks(ctx: CommandContext, page: PageHint): Promise<DoctorCheck[]> {
  const choice = chooseBackend(ctx.env);
  const node = nodeCheck(process.versions.node);
  if (choice.backend === null) return [node, backendChoiceCheck(choice)];
  const health = await ctx.browser.probe(page);
  const checks = [node, backendChoiceCheck(choice), ...backendChecks(ctx.browser.backend, health)];
  if (ctx.browser.backend === 'orca') checks.push(terminalCheck(health.worktree === true));
  if (health.transport) checks.push(transportCheck(health.transport));
  checks.push(trailCheck(ctx.env));
  return checks;
}
