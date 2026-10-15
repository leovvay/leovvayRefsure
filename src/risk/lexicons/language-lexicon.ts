import type { Lexicon } from './lexicon';

/**
 * One language file. `cancelVerbs` is the part of `cancelWords` that means "cancel" (never the plain "no"): only
 * a cancel verb next to a `cancelContext` word turns irreversible (spec §8.5), a "No" never does.
 */
export interface LanguageLexicon extends Lexicon {
  cancelVerbs: string[];
}
