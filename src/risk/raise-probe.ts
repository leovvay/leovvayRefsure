import { isBrowserError } from '../browser';
import type { BrowserPort, PageRef } from '../browser';
import { maxRisk } from './max-risk';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';

/** What one raiser read: it fired, it did not, or it could not read and counts as fired. */
export type Probe = 'hit' | 'miss' | 'assumed';

/**
 * A raiser that cannot read counts as hit (spec §8.3). A slow or failing backend call is such a case; a page that
 * is gone, Orca down or a stale ref still propagate for the registry to map.
 */
export function assumedOn(error: unknown): Probe {
  if (isBrowserError(error) && (error.code === 'timeout' || error.code === 'backend_error')) return 'assumed';
  throw error;
}

export async function countProbe(port: BrowserPort, page: PageRef, css: string): Promise<Probe> {
  try {
    return (await port.count!(page, css)) > 0 ? 'hit' : 'miss';
  } catch (error) {
    return assumedOn(error);
  }
}

/** Raises `into` to `cls` with `reason` (marked `:assumed` when the read failed); a miss leaves it alone. */
export function raise(into: RiskReading, cls: RiskClass, reason: string, probe: Probe): void {
  if (probe === 'miss') return;
  into.class = maxRisk(into.class, cls);
  into.reasons.push(probe === 'assumed' ? `${reason}:assumed` : reason);
}

/** A reading no raiser has raised yet: `read`, with no reasons. */
export function emptyReading(): RiskReading {
  return { class: 'read', reasons: [] };
}
