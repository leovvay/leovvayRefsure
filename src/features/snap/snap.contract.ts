/** `refsure snap`: line format v1 plus ` #<ordinal>/<twins> @eN`, in page order. `lines` is page text. */
export interface SnapResult {
  /** When lines were cut, the last entry is the footer `N lines dropped`. */
  lines: string[];
  /** Lines cut by `--max-chars`. */
  dropped: number;
  /** Snapshot lines refsure could not read, when there were any. */
  unparsed?: number;
}
