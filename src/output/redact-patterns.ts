import { redactSecrets } from '../egress';

interface Pattern { re: RegExp; replacement: string }

// Shapes only: the output layer never holds a key to compare against (spec §5.1).
const BASE: readonly Pattern[] = [
  { re: /\bBearer\s+(?!\[redacted)[^\s"']+/gi, replacement: 'Bearer [redacted]' },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: '[redacted:key]' },
];

/** Every secret shape (egress's `redactSecrets`), then bearer tokens and `sk-` keys. Redact before any cut. */
export function redactPatterns(text: string): string {
  let out = redactSecrets(text);
  // `replace` with a global regex starts at 0 whatever `lastIndex` holds.
  for (const { re, replacement } of BASE) out = out.replace(re, replacement);
  return out;
}
