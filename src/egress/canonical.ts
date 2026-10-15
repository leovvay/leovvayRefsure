import { createHash } from 'node:crypto';

/*
  Ported from the author's earlier decision code: one canonical JSON of what leaves, measured and digested
  as the same UTF-8, so a byte bound, an egress.log digest and a dry-run body all describe one string.
*/

function serialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')}}`;
}

/** JSON with object keys sorted at every depth. Throws on a value JSON cannot encode (a caller bug). */
export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('canonicalJson needs a JSON-compatible value');
  // The round trip drops undefined fields and functions exactly as JSON.stringify would.
  return serialize(JSON.parse(encoded) as unknown);
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}
