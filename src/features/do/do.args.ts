import type { DoStep } from './do-step';

/**
 * `do [--fill f=v] [--select f=o] [--check b] [--uncheck b] [--click c] ... [--expect e] [--text t] [--timeout 60s]
 * [--stall 10s] [--no-dismiss]`.
 */
export interface DoArgs {
  /** At most 8, in the order the command line gave them. */
  steps: DoStep[];
  /** What should show after the steps, described; the presence Decision's expectation, on the new text only. */
  expect: string | null;
  /** A literal that settles `seen` by code once it is in the new text (`fold`-matched). */
  text: string | null;
  timeoutMs: number;
  /** The wait ends `stalled` once neither the page text nor the URL changed for this long. */
  stallMs: number;
  /** Run one dismiss level first (the default); `--no-dismiss` leaves any overlay alone. */
  dismiss: boolean;
}
