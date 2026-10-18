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

/** `run`'s step: DONE or BLOCKED ends the run only with this probability; below it, the best other operation runs. */
export const STEP_OP_MIN = 0.5;

/**
 * `run`'s step floor (design 2026-10-17 §2.3, revised 2026-10-18: progress over certainty). The step acts on the
 * argmax, and every act needs this probability, above `none`: its target's, or PRESS_ENTER's own. The same floor at
 * read and write, since every act is floored at write anyway: what makes an act safe is the guard (its risk, the
 * veto, the fresh recheck, one send), not the probability. The high-risk rows are never reached: those classes
 * refuse before any act, whatever the probability.
 */
export const STEP_FLOOR = 0.3;

/** `run`'s step rows by risk class: the floor at read and write; the high-risk rows are never reached. */
export const STEP_ROWS: Readonly<Record<RiskClass, number>> = Object.freeze({
  read: STEP_FLOOR,
  write: STEP_FLOOR,
  consent: 0.85,
  auth: 0.85,
  money: 0.85,
  irreversible: 0.85,
});

/**
 * When the leading operation's head finds no target, a runner-up operation with a target head stands in when the
 * model did not rule it out: at least this probability. A click aimed at a field that waits for a value (CLICK does
 * not offer it then) leaves TYPE a small share, with its head sure of the field.
 */
export const STEP_RUNNER_MIN = 0.05;
