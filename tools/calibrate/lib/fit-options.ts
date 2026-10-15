/**
 * The fit's rule: the precision a row must reach, the fewest acted points that may show it, and how precision is
 * read: `isotonic` (the default) asks it of the answers at the threshold itself, `cumulative` of all answers at
 * or above it.
 */
export interface FitOptions { target: number; minPoints: number; method: 'isotonic' | 'cumulative' }
