import type { CalibrationEntry, SiteId } from '../../../src/questions';
import type { ThresholdFit } from './threshold-fit';

/** One site's fit: every edge fitted, the rows that would ship, and what they do on the runs. */
export interface SiteFit {
  site: SiteId;
  items: number;
  /** Answered runs on the site's declared wording. */
  runs: number;
  /** Runs left out: another wording, a failed call, or no answer for the question. */
  skipped: number;
  fits: Record<string, ThresholdFit>;
  starting: CalibrationEntry['threshold'];
  /** The shipped rows; `null` when the site does not qualify as measured. */
  threshold: CalibrationEntry['threshold'] | null;
  acted: number;
  correct: number;
  coverage: number | null;
  precision: number | null;
  /** Why the site is not measured, or `measured`. */
  why: string;
}
