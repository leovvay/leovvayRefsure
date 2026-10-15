import { parseArgs } from 'node:util';

export type Flags = Record<string, string | undefined>;

/** `--name value` options; an unknown or malformed option exits 64 with the usage line. */
export function flags(argv: readonly string[], strings: readonly string[], usage: string): Flags {
  const options: Record<string, { type: 'string' }> = {};
  for (const name of strings) options[name] = { type: 'string' };
  try {
    return parseArgs({ args: [...argv], options, strict: true, allowPositionals: false }).values as Flags;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage}\n`);
    process.exit(64);
  }
}

/** A string option, or `undefined`. */
export function opt(values: Flags, name: string): string | undefined {
  return values[name];
}

/** A required string option, or exit 64 with the usage line. */
export function need(values: Flags, name: string, usage: string): string {
  const value = values[name];
  if (value !== undefined && value !== '') return value;
  process.stderr.write(`missing --${name}\n${usage}\n`);
  process.exit(64);
}

/** A comma list option, trimmed, empties dropped. */
export function list(values: Flags, name: string, fallback: readonly string[]): string[] {
  const value = values[name];
  if (value === undefined) return [...fallback];
  return value.split(',').map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * A numeric option, or `fallback` when it is absent. A value that is not a finite number in [min, max] (a whole
 * number, with `integer`) exits 64 with the usage line: `Number('1usd')` is NaN, and a NaN cap or count would
 * switch its guard off without a word.
 */
export function num(
  values: Flags, name: string, fallback: number, usage: string,
  range: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const raw = values[name];
  if (raw === undefined) return fallback;
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = range;
  if (Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) return value;
  const want = [integer ? 'a whole number' : 'a number', ...(Number.isFinite(min) ? [`at least ${min}`] : []),
    ...(Number.isFinite(max) ? [`at most ${max}`] : [])].join(', ');
  process.stderr.write(`--${name} ${JSON.stringify(raw)} is not ${want}\n${usage}\n`);
  process.exit(64);
}
