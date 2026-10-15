import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * One JSON value per non-empty line. A line that does not parse (a killed run's last write) is skipped. A missing
 * file is an error, so a mistyped input path never reads as an empty set; `optional` reads it as no rows (a run's
 * own --out, before its first call).
 */
export function readJsonl<T>(path: string, opts: { optional?: boolean } = {}): T[] {
  if (!existsSync(path)) {
    if (opts.optional === true) return [];
    throw new Error(`${path}: no such file`);
  }
  const out: T[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      process.stderr.write(`${path}: skipped an unreadable line\n`);
    }
  }
  return out;
}

/** Appends one row synchronously, so a killed run loses at most the line being written. */
export function appendJsonl(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}
