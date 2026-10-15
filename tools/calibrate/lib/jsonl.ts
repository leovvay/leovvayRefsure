import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** One JSON value per non-empty line. A line that does not parse (a killed run's last write) is skipped. */
export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
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
