import type { ProviderId } from '../site-id';
import { calibrationEntry, resolveSite } from './entries';
import type { CalibratedSite, MaturityReading } from './maturity-reading';
import { familyOf, KNOWN_FAMILIES } from './model-family';

/**
 * How far an answer from `family` at this site and wording can be trusted (spec §8.6):
 * - a family other than the provider's known one is `experimental` and `newFamily` (authority `none`);
 * - a calibration entry for site + wording + line format 1 + family + provider is `measured`;
 * - a wording other than the site's declared one (a custom state set) was never measured: `experimental`;
 * - otherwise the site's declared maturity.
 * `family` may be a dated model string; it is reduced to its family here.
 */
export function maturityOf(
  site: CalibratedSite,
  provider: ProviderId,
  family: string,
  wordingHash: string,
): MaturityReading {
  const known = resolveSite(site);
  const answering = familyOf(family);
  if (answering !== KNOWN_FAMILIES[provider]) return { maturity: 'experimental', newFamily: true, entry: null };
  const entry = calibrationEntry(known.id, provider, answering, wordingHash);
  if (entry) return { maturity: 'measured', newFamily: false, entry };
  const maturity = wordingHash === known.wording.hash ? known.policy.maturity : 'experimental';
  return { maturity, newFamily: false, entry: null };
}
