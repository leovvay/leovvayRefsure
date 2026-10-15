import { SECRET_SHAPES } from '../egress';

interface Pattern { re: RegExp; replacement: string }

// Shapes only: the output layer never holds a key to compare against (spec §5.1).
const BASE: readonly Pattern[] = [
  { re: /\bBearer\s+(?!\[redacted)[^\s"']+/gi, replacement: 'Bearer [redacted]' },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: '[redacted:key]' },
];

let compiled: readonly Pattern[] | null = null;

// Built on first use, so a module cycle through egress never reads the shapes before they exist.
function patterns(): readonly Pattern[] {
  if (compiled) return compiled;
  const shapes = SECRET_SHAPES.map((shape: { family: string; re: RegExp }) => ({
    re: new RegExp(shape.re.source, shape.re.flags.includes('g') ? shape.re.flags : `${shape.re.flags}g`),
    replacement: `[redacted:${shape.family}]`,
  }));
  compiled = [...shapes, ...BASE];
  return compiled;
}

/** Replaces bearer tokens, `sk-` keys and every secret shape in `text`. */
export function redactPatterns(text: string): string {
  let out = text;
  for (const { re, replacement } of patterns()) {
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }
  return out;
}
