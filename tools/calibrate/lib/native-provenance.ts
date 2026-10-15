/**
 * What a replay measured for a site: the sets it pooled with their hashes and capture counts, the fit it gave,
 * and whether that fit qualified. Written beside an entry, or a held site, in calibration.json; refsure never reads
 * it. The Orca-native replay's own reading (spec §9 step 2) has this shape, and so does a held site's pooled one.
 */
export interface NativeProvenance {
  sets: { set: string; sha256: string; asked: number; code: number; codeCorrect: number; dropped: number; goldNotOffered: number }[];
  runs: number;
  /** Distinct pages; a page asked in several PII mask modes counts once (`masks` counts the modes). */
  items: number;
  /** Pages asked with PII masks on and off, when the runs hold both modes. */
  masks?: { on: number; off: number };
  orders: number;
  replays: number;
  model: string;
  route: string;
  /** The rows the fit gives (each already max'ed with the starting and shipped rows); `null` when none. */
  rows: number | Readonly<Record<string, number>> | { yesAtLeast: number; noAtMost: number } | null;
  fitted: Record<string, number | null>;
  acted: number;
  correct: number;
  coverage: number | null;
  precision: number | null;
  wilsonLow: number | null;
  /** `measured`, or why the fit gives no row. */
  why: string;
  /**
   * The same fit with the calls on visual-only items left out (their set marks the answer as visible only in the
   * picture). A reading for the owner, never what ships: refsure cannot tell such a page apart at run time.
   */
  textOnly?: {
    visualOnlyCalls: number;
    /** Pages and calls the text-only fit read. */
    items: number;
    runs: number;
    rows: NativeProvenance['rows'];
    acted: number;
    correct: number;
    coverage: number | null;
    wilsonLow: number | null;
    why: string;
  };
  date: string;
}
