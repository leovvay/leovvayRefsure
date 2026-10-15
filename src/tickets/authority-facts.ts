/** What `authorityFor` weighs besides maturity and site (spec §8.3). A missing fact counts against authority. */
export interface AuthorityFacts {
  /** `corroborate()`: the pick shares a content word with the intent, or is the unique exact-name match. */
  corroborated?: boolean;
  confidence?: number | null;
  /** dismiss: the pick's name matched a lexicon's close/reject terms. */
  lexiconCloseMatch?: boolean;
  /** Both providers of an `agree` combo picked the same presented index. */
  agreed?: boolean;
  /** The answering model is of a family no release has measured. */
  newFamily?: boolean;
}
