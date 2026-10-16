import type { CalibrationEntry, SiteId } from '../../../src/questions';
import type { MasksReading } from './masks-reading';
import type { ThresholdFit } from './threshold-fit';

/** One site's fit: every edge fitted, the rows the method gives, what they do on the runs, and what ships. */
export interface SiteFit {
  site: SiteId;
  /** Distinct pages the runs asked about; a page asked in several PII mask modes counts once. */
  items: number;
  /** Pages asked with PII masks on and off, when the runs hold both modes. */
  masks?: { on: number; off: number };
  /** Answered runs on the site's declared wording. */
  runs: number;
  /** Runs left out: another wording, a failed call, or no answer for the question. */
  skipped: number;
  fits: Record<string, ThresholdFit>;
  starting: CalibrationEntry['threshold'];
  /** The rows the method gives: each fitted edge max'ed with its starting row; `null` when no edge qualifies. */
  rows: CalibrationEntry['threshold'] | null;
  /** The rows that ship as `measured`: `rows`, unless the site is held at its declared maturity; else `null`. */
  threshold: CalibrationEntry['threshold'] | null;
  /** Answers acted on at `rows`, and how many were right; coverage is acted over runs. */
  acted: number;
  correct: number;
  coverage: number | null;
  precision: number | null;
  /** The Wilson 95 % lower bound of that precision over the acted answers (each call one answer). */
  wilsonLow: number | null;
  /** Per set the runs came from: answered runs, acted answers at the rows, and how many were right. */
  bySet: Record<string, { runs: number; acted: number; correct: number }>;
  /** PII masks on against off, on the pages asked in both modes, at the rows refsure acts on; when there are any. */
  maskModes?: MasksReading;
  /** `measured`, or why the site keeps its declared maturity. */
  why: string;
}
