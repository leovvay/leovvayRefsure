/**
 * `refsure mark`: the mark's id, for `outcome --mark` and `triage --since`, and the label it was given. `mark` is
 * null under `--dry-run`, which saves nothing.
 */
export interface MarkResult {
  mark: string | null;
  label: string | null;
  /** When the mark expires, in seconds from now. */
  expires_in_s: number;
}
