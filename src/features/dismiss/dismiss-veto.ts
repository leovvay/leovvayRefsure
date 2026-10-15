import { fold } from '../../page-model';
import { findTerm, type TermHit } from '../../risk';

/**
 * The never-click list (spec §6.2, §8.4): accept, agree, allow, subscribe, buy, trial, enable, upgrade, manage,
 * settings, preferences, customize, in every lexicon. A dismiss never clicks a control whose name carries one,
 * whatever the Decision, `agree` or `--propose` say; it is not overridable.
 */
export function vetoOf(name: string): TermHit | null {
  return findTerm('dismissVeto', fold(name));
}
