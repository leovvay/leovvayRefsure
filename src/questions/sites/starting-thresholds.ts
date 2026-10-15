import type { RiskClass } from '../../risk';
import type { NoulBand } from '../wire-types';

/*
  The starting thresholds (spec §6.1), ported from the author's earlier
  decision code, until a calibration.json entry replaces them (spec §9).
*/

/** A Choice answers at or above this. */
export const CHOICE_START = 0.8;

/** A Noul is `yes` at or above 0.85 and `no` at or below 0.15. */
export const NOUL_BAND: NoulBand = Object.freeze({ yesAtLeast: 0.85, noAtMost: 0.15 });

/** Locate and find by risk class; auth and consent join money and irreversible at the strictest row. */
export const LOCATE_ROWS: Readonly<Record<RiskClass, number>> = Object.freeze({
  read: 0.6,
  write: 0.8,
  consent: 0.85,
  auth: 0.85,
  money: 0.85,
  irreversible: 0.85,
});

/** A dismiss only closes an overlay, so it answers at the reading row. */
export const DISMISS_START = LOCATE_ROWS.read;
