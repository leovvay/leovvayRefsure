/** `refsure mark`: the mark's id, for `outcome --mark` and `triage --since`, and the label it was given. */
export interface MarkResult {
  mark: string;
  label: string | null;
  /** When the mark expires, in seconds from now. */
  expires_in_s: number;
}
