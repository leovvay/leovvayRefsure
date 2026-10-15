/** Expiry of any stored entry that carries `createdAt` and `ttlMs` (tickets and marks), for `purge`; else null. */
export function expiresAtOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const { createdAt, ttlMs } = value as { createdAt?: unknown; ttlMs?: unknown };
  if (typeof createdAt !== 'number' || typeof ttlMs !== 'number') return null;
  const at = createdAt + ttlMs;
  return Number.isFinite(at) ? at : null;
}
