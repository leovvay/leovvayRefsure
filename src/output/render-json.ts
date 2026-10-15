import type { Envelope } from './envelope';
import { redactPatterns } from './redact-patterns';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactPatterns(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(redactDeep);
  if (typeof value !== 'object' || value === null) return value;
  const toJson = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJson === 'function') return redactDeep(toJson.call(value));
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [redactPatterns(key), redactDeep(inner)]));
}

/**
 * One line of JSON with every string (keys included) passed through `redactPatterns`. U+2028 and U+2029 are
 * escaped too, so no reader splits the envelope.
 */
export function renderEnvelope(envelope: Envelope): string {
  return JSON.stringify(redactDeep(envelope))
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029');
}
