/** The lower edge of the Wilson score interval (95 %, z = 1.96) for `right` of `n`; `null` when `n` is 0. */
export function wilsonLow(right: number, n: number, z = 1.96): number | null {
  if (n <= 0) return null;
  const p = right / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.round(((centre - margin) / (1 + z2 / n)) * 10_000) / 10_000;
}
