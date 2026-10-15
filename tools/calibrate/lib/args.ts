import { parseArgs } from 'node:util';

export type Flags = Record<string, string | undefined>;

/** `--name value` options, all strings; an unknown or malformed option exits 64 with the usage line. */
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

/** A required string option, or exit 64 with the usage line. */
export function need(values: Flags, name: string, usage: string): string {
  const value = values[name];
  if (typeof value === 'string' && value !== '') return value;
  process.stderr.write(`missing --${name}\n${usage}\n`);
  process.exit(64);
}

/** A comma list option, trimmed, empties dropped. */
export function list(values: Flags, name: string, fallback: readonly string[]): string[] {
  const value = values[name];
  if (typeof value !== 'string') return [...fallback];
  return value.split(',').map((part) => part.trim()).filter((part) => part !== '');
}
