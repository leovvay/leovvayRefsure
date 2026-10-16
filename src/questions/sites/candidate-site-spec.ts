import type { SiteId } from '../site-id';
import type { SitePolicy } from '../site-policy';

/** One shuffled Choice over caller lines plus `none`: locate, find, dismiss and option-map differ only in these. */
export interface CandidateSiteSpec<In> {
  id: SiteId;
  question: string;
  instructions: string;
  none: string;
  policy: SitePolicy;
  /**
   * The most lines asked over; more are cut from the end, where a ranked list keeps its weakest. Lines past the
   * questions byte bound are cut from the end too, so a site never refuses `oversize` for its own options.
   */
  max: number;
  /** The request state from the caller's text, bounded; its values also seed the shuffle. */
  state(input: In): Record<string, string>;
  lines(input: In): readonly string[];
}
