/** Where a calibration entry's numbers came from (spec §9); shipped with the entry, read by people only. */
export interface CalibrationProvenance {
  /** The data the fit was run on, named without publishing it. */
  source: string;
  /** The set's file name within that source. */
  set: string;
  items: number;
  /** Answered calls the fit read: items × orders, failures left out. */
  runs: number;
  /** Shuffled orders (or repeats, for unshuffled sites) per item. */
  orders: number;
  /** The exact snapshot that answered, and the host it answered through. */
  model: string;
  route: string;
  method: string;
  target: number;
  minPoints: number;
  /** Each row's value as fitted, before the max with the starting row; `null` where the fit fell back. */
  fitted: Record<string, number | null>;
  /** Answers acted on at the shipped rows, and how many of them were right. */
  acted: number;
  correct: number;
}
