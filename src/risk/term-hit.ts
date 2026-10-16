/** The word lists of a lexicon, by field. */
export type TermField =
  | 'money' | 'irreversible' | 'auth' | 'consent' | 'dismissClose' | 'dismissVeto' | 'cancelContext'
  | 'cancelVerbs' | 'cancelWords' | 'confirmCue';

/** Which language and which term matched, both `fold`ed. */
export interface TermHit { lang: string; term: string }
