import type { DecisionSite } from '../decision-site';
import type { Maturity } from '../site-id';

/** What calibration reads of a site: its id, policy and declared wording. */
export type CalibratedSite = Pick<DecisionSite<unknown, unknown, unknown>, 'id' | 'policy' | 'wording'>;

export interface MaturityReading {
  maturity: Maturity;
  /** The answering model's family is not the one refsure knows for its provider: authority `none`. */
  newFamily: boolean;
}
