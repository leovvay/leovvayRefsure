/** A container `--scope` keeps: the elements inside a dialog, the main landmark or a form. */
export type SnapScope = 'dialog' | 'main' | 'form';

export interface SnapArgs {
  /** The printed lines' budget; cut at a line boundary. */
  maxChars: number;
  scope: SnapScope | null;
  /** Interactive elements with a ref only (the default); false lists every named node. */
  interactive: boolean;
}
