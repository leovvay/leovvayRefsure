/** What a live ref shows as its name, read without a snapshot (spec §8.3 live-ref path). */
export interface LiveName {
  /** innerText, else the first non-empty `aria-label`, `placeholder`, `title`: what `--expect-name` is held to. */
  seen: string;
  /**
   * Every non-empty name source (innerText, `aria-label`, `title`, `placeholder`), for the lexicon. An icon
   * button's text is a glyph while its label says "Delete": risk reads them all, so it can only rise.
   */
  sources: string[];
}
