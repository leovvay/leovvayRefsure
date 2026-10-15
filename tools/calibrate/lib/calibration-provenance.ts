import type { NativeProvenance } from './native-provenance';

/**
 * Where a calibration entry's numbers came from (spec §9). The fit writes it beside each entry in calibration.json
 * for people to read; refsure itself never reads it.
 */
export interface CalibrationProvenance {
  /** The data the fit was run on, named without publishing it. */
  source: string;
  /** The set's file name within that source. */
  set: string;
  items: number;
  /** Answered calls the fit read, pooled over every replay; failures left out. */
  runs: number;
  /** Distinct shuffle salts (repeats, for unshuffled sites) across the pooled replays. */
  orders: number;
  /** Replays pooled: separate `run` outputs, each its own calls to the model. */
  replays: number;
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
  /** The Wilson 95 % lower bound of the precision over the acted answers, when the fit reported it. */
  wilsonLow?: number | null;
  /** The Orca-native replay's own reading of this site (spec §9 step 2), when it ran. */
  native?: NativeProvenance;
  /** When the native fit raised an entry already shipped: that entry's rows, set and date. */
  floor?: { threshold: unknown; set: string; n: number; date: string };
}
