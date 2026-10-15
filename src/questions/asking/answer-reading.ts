import type { Maturity } from '../site-id';

/** How far the answer of one Decision can be trusted, read from the models that gave it (spec §8.6). */
export interface AnswerReading {
  maturity: Maturity;
  /** A model family no release has measured answered: authority `none`. */
  newFamily: boolean;
  /** A known family answered under another model string (a dated snapshot): kept, but flagged. */
  modelChanged: boolean;
  /** The models that gave the answer (or, on an abstain, every model that replied), bare names. */
  models: string[];
}
