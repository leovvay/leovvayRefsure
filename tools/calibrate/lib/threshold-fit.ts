/** One fitted edge: the value read off the fit, or why none could be. */
export interface ThresholdFit {
  /** The fitted value; `null` when the rule was not met. */
  value: number | null;
  /** Points on the confident side of `value`. */
  beyond: number;
  /** Observed precision of those points; `null` when nothing was fitted. */
  precision: number | null;
  /** `fitted`, `no data`, `no score reaches <target>`, or `<n> points … need <min>`. */
  why: string;
}
