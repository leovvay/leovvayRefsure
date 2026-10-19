/**
 * `refsure snap`: line format v1 plus ` #<ordinal>/<twins> @eN`, in page order. `lines` is page text. On a cut,
 * the envelope's `next` is the same snap with the `--max-chars` that prints every line.
 */
export interface SnapResult {
  /**
   * When lines were cut, the last entry is the footer `N lines dropped (~T tokens): --max-chars=<total> shows all`,
   * inside the budget.
   */
  lines: string[];
  /** Lines cut by the budget. */
  dropped: number;
  /** Snapshot lines refsure could not read, when there were any. */
  unparsed?: number;
}
