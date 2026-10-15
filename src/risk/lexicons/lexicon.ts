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
  /** The plain cancel / no words of a confirm dialog, which never become irreversible. */
  cancelWords: string[];
  /** Dialog wording that marks a confirm dialog: "are you sure", "confirm", ... */
  confirmCue: string[];
}
