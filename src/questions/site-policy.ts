import type { RiskClass } from '../risk';
import type { Maturity, ProviderId } from './site-id';
import type { NoulBand } from './wire-types';

export type Threshold = number | NoulBand;

/** Site-owned policy (spec §5.2). A provider with no threshold row is not allowed at the site. */
export interface SitePolicy {
  threshold: Readonly<Partial<Record<ProviderId, number | NoulBand | Readonly<Record<RiskClass, number>>>>>;
  combos?: readonly ('agree' | 'fallback')[];
  /** Who may answer alone; every provider with a row when absent. Dismiss lets OpenAI in only through `agree`. */
  solo?: readonly ProviderId[];
  /** Declared default; a matching calibration entry makes it `measured`. */
  maturity: Maturity;
}
