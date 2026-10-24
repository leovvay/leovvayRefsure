import { chooseBackend, orcaTrailBlocked } from '../browser';
import { TRAIL_PAGE } from './trail-page-call';
import { trailSwitchedOff } from './trail-switch';

/**
 * Whether the trail draws for a command run with `env`, and why, for doctor's informational `trail` check. It never
 * fails a check: the trail is a view for the human, and every command works the same without it.
 */
export function orcaTrailStatus(env: NodeJS.ProcessEnv): string {
  if (trailSwitchedOff(env)) return `off: REFSURE_TRAIL=${env.REFSURE_TRAIL?.trim().slice(0, 8) ?? ''}`;
  if (TRAIL_PAGE === null) return 'off: this refsure runs unbundled, without the page script build.mjs puts in';
  const { backend } = chooseBackend(env);
  if (backend === 'agent-browser') return 'off: agent-browser (v1 draws in Orca only)';
  if (backend === null) return 'off: no backend is chosen';
  const blocked = orcaTrailBlocked(env);
  if (blocked !== null) return `off: the Orca CLI transport (${blocked}); each draw would spawn orca`;
  return 'on: refsure lists its own steps in the agent\'s Orca tab (aria-hidden, pointer-events none, hidden from '
    + 'snapshots and text reads; one eval of a few ms before each act); REFSURE_TRAIL=off turns it off';
}
