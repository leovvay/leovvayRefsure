import type { PageReading } from '../shared';

/**
 * What one poll judges, from the whole page as it was read: by default the whole reading. `do` judges only the
 * text new since its baseline (`null` when nothing is new: no code rule and no Decision on that poll). The stall
 * rule always reads the whole page.
 */
export type PollView = (whole: PageReading) => PageReading | null;
