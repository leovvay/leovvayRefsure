import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { SetMeta } from './set-meta';

/** A labelled set file as both conversion and the Orca-native replay read it: one JSON row per non-empty line. */
export interface SetFile {
  /** The file's base name: the set name every meta file and run row carries. */
  name: string;
  /** sha256 of the file's bytes, as read. */
  sha256: string;
  rows: Record<string, unknown>[];
}

/** Reads a set; a line that does not parse is an error naming it, never a skipped item. */
export function readSet(path: string): SetFile {
  const bytes = readFileSync(path);
  const rows: Record<string, unknown>[] = [];
  for (const [index, line] of bytes.toString('utf8').split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      rows.push(JSON.parse(line) as Record<string, unknown>);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { name: basename(path), sha256: createHash('sha256').update(bytes).digest('hex'), rows };
}

/** Today's date (UTC), as every meta file and calibration record carries it. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Writes `<out>.meta.json` beside an output and echoes the meta on stdout. */
export function writeSetMeta(outPath: string, meta: SetMeta): void {
  writeFileSync(`${outPath}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(meta)}\n`);
}
