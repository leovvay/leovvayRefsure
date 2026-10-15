import type { DecisionSite } from '../decision-site';
import type { Maturity, SiteId } from '../site-id';
import type { CalibrationEntry } from './calibration-entry';

/** What calibration reads of a site: its id, policy and declared wording. A bare id names a shipped site. */
export type CalibratedSite = SiteId | Pick<DecisionSite<unknown, unknown, unknown>, 'id' | 'policy' | 'wording'>;

export interface MaturityReading {
  maturity: Maturity;
  /** The answering model's family is not the one refsure knows for its provider: authority `none`. */
  newFamily: boolean;
  /** The calibration entry that made it `measured`; its threshold replaces the policy row. */
  entry: CalibrationEntry | null;
}
