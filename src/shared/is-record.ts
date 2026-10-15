/** A plain JSON object: not null, not an array. Every reader of untrusted JSON (replies, files, answers) uses it. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite probability in [0, 1]. */
export function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
