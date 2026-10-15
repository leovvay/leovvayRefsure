import data from './calibration.json' with { type: 'json' };
import { SITES } from '../sites';
import type { ProviderId, SiteId } from '../site-id';
import type { CalibrationEntry } from './calibration-entry';
import type { CalibratedSite } from './maturity-reading';

function isEntry(value: unknown): value is CalibrationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.site === 'string' && typeof entry.wordingHash === 'string' && entry.lineFormat === 1
    && typeof entry.modelFamily === 'string' && typeof entry.provider === 'string'
    && (typeof entry.threshold === 'number' || (typeof entry.threshold === 'object' && entry.threshold !== null));
}

/** The shipped entries; a malformed one is dropped rather than trusted. */
const shipped: unknown = (data as { entries?: unknown }).entries;
const ENTRIES: readonly CalibrationEntry[] = Array.isArray(shipped) ? shipped.filter(isEntry) : [];

/** The entry measured for exactly this site, provider, family and wording, on line format 1. */
export function calibrationEntry(
  site: SiteId,
  provider: ProviderId,
  family: string,
  wordingHash: string,
): CalibrationEntry | null {
  return ENTRIES.find((entry) => entry.site === site && entry.provider === provider
    && entry.modelFamily === family && entry.wordingHash === wordingHash) ?? null;
}

/** A bare id names a shipped site; a site object is read as given. */
export function resolveSite(site: CalibratedSite): Exclude<CalibratedSite, SiteId> {
  return typeof site === 'string' ? SITES[site] : site;
}
