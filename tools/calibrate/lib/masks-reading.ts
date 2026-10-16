import type { CalibrationEntry } from '../../../src/questions';

/** One PII mask mode's calls on the paired pages, read at the rows refsure acts on. */
type ModeReading = {
  calls: number;
  /** Calls whose answer was right, acted on or not. */
  right: number;
  /** Calls acted on at the rows, and how many of them were right; coverage is acted over calls. */
  acted: number;
  correct: number;
  coverage: number;
  precision: number | null;
  /** The Wilson 95 % lower bound of that precision over the acted calls. */
  wilsonLow: number | null;
};

/**
 * PII masks on against off (spec §7.3): the pages a set asked in both modes, each mode read at the rows refsure
 * acts on for the site (its entry's when measured, else its declared rows). The fit writes it to calibration.json
 * as the masks' own record; refsure never reads it.
 */
export interface MasksReading {
  /** The sets that asked a page in both modes. */
  sets: string[];
  /** Pages asked in both modes; the modes' numbers count only these pages' calls. */
  pages: number;
  /** Pages whose most frequent answer is the same in both modes; a tie in either mode does not agree. */
  agree: number;
  /** The rows the modes are read at, and where they come from. */
  rows: CalibrationEntry['threshold'];
  rowsFrom: 'measured' | 'declared';
  /** Distinct salts among the paired calls. */
  orders: number;
  on: ModeReading;
  off: ModeReading;
}
