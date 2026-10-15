import { findTerm, type TermHit } from '../../risk';
import { rejectReadings } from './dismiss-reading';

/**
 * The never-click list (spec §6.2, §8.4): accept, agree, allow, subscribe, buy, trial, enable, upgrade, manage,
 * settings, preferences, customize, in every lexicon. A dismiss never clicks a control whose name carries one,
 * whatever the Decision, `agree` or `--propose` say; it is not overridable. Pass the raw node name, not the
 * fingerprint's `norm`ed one: the term counts in either reading, so a zero-width space inside "Acc&#8203;ept"
 * (spaced by `norm`) still hides nothing. A negated accept ("Continuer sans accepter") declines, so it is no
 * accept; a negated "buy" still is (`rejectReadings`).
 */
export function vetoOf(rawName: string): TermHit | null {
  for (const reading of rejectReadings(rawName)) {
    const hit = findTerm('dismissVeto', reading);
    if (hit !== null) return hit;
  }
  return null;
}
