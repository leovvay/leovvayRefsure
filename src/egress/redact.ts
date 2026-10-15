import { SECRET_SHAPES } from './secret-shapes';

/**
 * Replaces every secret-shape match with `[redacted:<family>]`. Idempotent: no shape matches a placeholder.
 * Strip controls before and cut after, never the other way round (a cut secret no longer has its shape).
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const shape of SECRET_SHAPES) {
    // `replace` with a global regex starts at 0 whatever `lastIndex` holds, so shared regexes stay safe.
    out = out.replace(shape.re, `[redacted:${shape.family}]`);
  }
  return out;
}
