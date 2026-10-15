/**
 * What the Orca-native replay (spec §9 step 2) measured for a site: the sets it pooled with their hashes and
 * capture counts, the fit it gave, and whether that fit qualified. Written beside an entry in calibration.json.
 */
export interface NativeProvenance {
  sets: { set: string; sha256: string; asked: number; code: number; codeCorrect: number; dropped: number; goldNotOffered: number }[];
  /** Calls left out because their set marks the answer as visible only in the picture (`--text-only`). */
  visualOnlyLeftOut: number;
  runs: number;
  items: number;
  orders: number;
  replays: number;
  model: string;
  route: string;
  /** The rows the native fit gives (each already max'ed with the starting and shipped rows); `null` when none. */
  rows: number | Readonly<Record<string, number>> | { yesAtLeast: number; noAtMost: number } | null;
  fitted: Record<string, number | null>;
  acted: number;
  correct: number;
  coverage: number | null;
  precision: number | null;
  wilsonLow: number | null;
  /** `measured`, or why the native fit gives no row. */
  why: string;
  date: string;
}
