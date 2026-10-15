/**
 * The fit's rule: the precision a row must reach, the fewest acted points that may show it, and how precision is
 * read: `isotonic` (the default) asks it of the answers at the threshold itself, `cumulative` of all answers at
 * or above it.
 */
export interface FitOptions {
  target: number;
  minPoints: number;
  /**
   * The fewest distinct pages a risk label needs before it gets a row of its own; below it the label reads the
   * all-points fit. The calls of one page are correlated, so `minPoints` alone counts one page several times.
   */
  minItems: number;
  method: 'isotonic' | 'cumulative';
  /** Rows already shipped for the site: each starting row is raised to its row here (never loosen). */
  floor?: number | Readonly<Record<string, number>> | { yesAtLeast: number; noAtMost: number };
  /** The runs include Orca-native ones: a site held for want of native lines is fitted to ship. */
  native?: boolean;
}
