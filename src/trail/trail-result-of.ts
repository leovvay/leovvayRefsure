import type { ActResult } from '../browser';
import type { TrailRow } from './trail-spec';

type Ended = Pick<TrailRow, 'result' | 'detail'>;

/**
 * An act's answer as its row ends: `done` is `ok` (Orca took it; the page's own arm says whether input landed), a
 * stale ref is `refused` with why (covered, or only the fill's focus went out), `unknown` stays unknown, and a
 * throw (refused before dispatch, or interrupted) is `refused/error`.
 */
export function actEnded(result: ActResult | null): Ended {
  if (result === null) return { result: 'refused', detail: 'error' };
  if (result.kind === 'done') return { result: 'ok' };
  if (result.kind === 'unknown') return { result: 'unknown' };
  if (result.covered !== undefined) return { result: 'refused', detail: 'covered' };
  return { result: 'refused', detail: result.focused ? 'focused' : 'stale' };
}

/**
 * A command that read and did not act, as its row ends, from its envelope's status and cause: an abstain names a
 * low confidence or a `none` pick, a stale page is `refused/stale`, and a status that means the verb could not do
 * its work (a provider down, not set up, a usage error) is `refused/error`.
 */
export function readEnded(status: string, cause: string | null): Ended {
  if (status === 'ok') return { result: 'ok' };
  if (status === 'abstained') {
    const named = cause === 'low_confidence' || cause === 'none_chosen';
    return named ? { result: 'abstained', detail: cause } : { result: 'abstained' };
  }
  if (status === 'stale') return { result: 'refused', detail: 'stale' };
  if (status === 'refused') return { result: 'refused' };
  return { result: 'refused', detail: 'error' };
}
