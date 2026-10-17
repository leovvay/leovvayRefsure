/**
 * `refsure wait-for`: `present` when code or the presence Decision saw it, `not_seen` when the timeout passed
 * first (never "absent"), `stalled` when `--stall` saw the page stop changing first; `null` when a Decision could
 * not be asked at all. `decisions` counts provider calls.
 */
export interface WaitForResult {
  verdict: 'present' | 'not_seen' | 'stalled' | null;
  polls: number;
  decisions: number;
  by: 'code' | 'decision';
  /** Which code rule saw it, when code did. */
  rule?: 'text' | 'url';
  waited_ms: number;
}
