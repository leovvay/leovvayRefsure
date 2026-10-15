/**
 * An item the command settles with no Decision (an exact name, the recorded line, no overlay, the veto, a dialog
 * or a failed load), or one the replay could not use: written beside the asked items, never fitted.
 */
export interface CodeRow {
  id: string;
  set: string;
  site: string;
  /** `code` (settled by refsure's own rules) or `drop` (the gold could not be mapped onto the page). */
  kind: 'code' | 'drop';
  /** What code answered: a twin-group line, `none`, a state key; `null` for a drop. */
  answer: string | null;
  gold: string;
  correct: boolean | null;
  rule: string;
  condition: string;
  lang: string;
  masks?: boolean;
  visualOnly?: boolean;
}
