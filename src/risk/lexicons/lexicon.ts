/** One language's words. Every name is matched against the union of all lexicons (spec §8.5). */
export interface Lexicon {
  lang: string;
  money: string[];
  irreversible: string[];
  auth: string[];
  consent: string[];
  dismissClose: string[];
  dismissVeto: string[];
  /** Words that make "cancel" irreversible: subscription, order, account, booking. */
  cancelContext: string[];
  /**
   * The part of `cancelWords` that means "cancel" (never the plain "no"): only a cancel verb next to a
   * `cancelContext` word turns irreversible (spec §8.5), a "No" never does.
   */
  cancelVerbs: string[];
  /** The plain cancel / no words of a confirm dialog, which never become irreversible. */
  cancelWords: string[];
  /** Dialog wording that marks a confirm dialog: "are you sure", "confirm", ... */
  confirmCue: string[];
}
