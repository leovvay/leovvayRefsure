const DURATION = /^(\d{1,7})(ms|s|m)$/;
const UNIT_MS: Readonly<Record<string, number>> = { ms: 1, s: 1_000, m: 60_000 };

/** `\d+(ms|s|m)` in milliseconds (spec §6.2), or null for anything else. */
export function parseDuration(text: string): number | null {
  const match = DURATION.exec(text.trim());
  if (match === null) return null;
  const [, amount, unit] = match;
  const ms = Number(amount) * (UNIT_MS[unit ?? ''] ?? Number.NaN);
  return Number.isSafeInteger(ms) ? ms : null;
}

/** A duration as a person reads it: `30s`, `2m`, `1500ms`. */
export function formatDuration(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}
