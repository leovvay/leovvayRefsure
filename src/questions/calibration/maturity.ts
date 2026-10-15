import type { ProviderId } from '../site-id';
import { calibrationEntry } from './entries';
import type { CalibratedSite, MaturityReading } from './maturity-reading';
import { familyOf, KNOWN_FAMILIES } from './model-family';

/**
 * How far an answer from `model` at this site and wording can be trusted (spec §8.6):
 * - a family other than the provider's known one is `experimental` and `newFamily` (authority `none`);
 * - a calibration entry for site + wording + line format 1 + family + provider is `measured`;
 * - a wording other than the site's declared one (a custom state set) was never measured: `experimental`;
 * - otherwise the site's declared maturity.
 * `model` is the answering model's name, dated or not; it is reduced to its family here.
 */
export function maturityOf(
  site: CalibratedSite,
  provider: ProviderId,
  model: string,
  wordingHash: string,
): MaturityReading {
  const answering = familyOf(model);
  if (answering !== KNOWN_FAMILIES[provider]) return { maturity: 'experimental', newFamily: true };
  if (calibrationEntry(site.id, provider, answering, wordingHash)) return { maturity: 'measured', newFamily: false };
  const maturity = wordingHash === site.wording.hash ? site.policy.maturity : 'experimental';
  return { maturity, newFamily: false };
}
