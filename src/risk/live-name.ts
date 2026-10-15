/** What a live ref shows as its name, read without a snapshot (spec §8.3 live-ref path). */
export interface LiveName {
  /**
   * The name a browser would give it, roughly: the `aria-labelledby` text, `aria-label`, a `<label for>`, a
   * wrapping `<label>`, innerText (not for fill or select), `placeholder`, `title`; the first that is not empty. A
   * mismatch quotes it, and the outcome Decision's `acted_element` names it.
   */
  seen: string;
  /**
   * Every name `--expect-name` may match: each of those sources that is not empty. An icon button's text is a glyph
   * while its label says "Delete"; the snapshot shows the label. innerText is left out for fill and select: a
   * field's text is its value or its options, never its name.
   */
  names: string[];
  /** Every non-empty name source, innerText included, for the lexicon: risk reads them all, so it can only rise. */
  sources: string[];
  /**
   * Its innerText, `norm`ed, whatever the action: the confirm-dialog raiser checks whether an open dialog shows it.
   * For a field it may be a value: it is never shown, logged or sent.
   */
  text: string;
}
