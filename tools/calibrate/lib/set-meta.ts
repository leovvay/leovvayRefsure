/** Written next to a converted set: where it came from and what conversion kept or dropped. */
export interface SetMeta {
  set: string;
  /** sha256 of the source set file's bytes, as read. */
  sha256: string;
  site: string;
  items: number;
  kept: number;
  droppedBySource: number;
  droppedById: number;
  lines: number;
  unparsedLines: number;
  /** Converted lines whose path names a dialog, alertdialog or region: the place live overlay candidates carry. */
  overlayLines: number;
  date: string;
}
