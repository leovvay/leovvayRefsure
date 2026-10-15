import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

/** Creates the parent directory 0700 when missing; an existing one keeps its mode. */
export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
}

/** Writes 0600 to a temp file beside `path`, then renames it into place, so a reader never sees half a file. */
export function writePrivateFile(path: string, text: string): void {
  ensureParentDir(path);
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
