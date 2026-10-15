import type { RiskClass } from '../../risk';
import type { ProviderId } from '../site-id';
import type { Threshold } from '../site-policy';
import type { NoulBand } from '../wire-types';
import { calibrationEntry } from './entries';
import type { CalibratedSite } from './maturity-reading';
import { familyOf } from './model-family';

type Row = number | NoulBand | Readonly<Record<string, number>>;

function isBand(row: Row): row is NoulBand {
  return typeof row === 'object' && typeof (row as NoulBand).yesAtLeast === 'number'
    && typeof (row as NoulBand).noAtMost === 'number';
}

/** The strictest row of a per-risk record: a caller that names no risk never gets the loosest. */
function strictest(rows: Readonly<Record<string, number>>): number | null {
  const values = Object.values(rows).filter((value) => typeof value === 'number' && Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

/** The row for `risk`, or `null` when a per-risk record has none for it. */
function rowFor(row: Row, risk: RiskClass | undefined): Threshold | null {
  if (typeof row === 'number' || isBand(row)) return row;
  if (risk === undefined) return strictest(row);
  const value = row[risk];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The threshold `site.read` gets (spec §6.1, §9): the calibration entry for this model's family and wording when
 * one exists, else the policy row for `risk`, else the strictest row. `null` when the provider has no row, which
 * means it is not allowed at the site. Without `model` no entry is consulted.
 */
export function thresholdFor(
  site: CalibratedSite,
  provider: ProviderId,
  risk?: RiskClass,
  model?: string,
  wordingHash?: string,
): Threshold | null {
  const row = site.policy.threshold[provider];
  if (row === undefined) return null;
  if (model !== undefined) {
    const entry = calibrationEntry(site.id, provider, familyOf(model), wordingHash ?? site.wording.hash);
    const fitted = entry ? rowFor(entry.threshold, risk) : null;
    if (fitted !== null) return fitted;
  }
  return rowFor(row, risk) ?? rowFor(row, undefined);
}
