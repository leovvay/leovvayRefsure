import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, closeSync, constants, fchmodSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync,
  unlinkSync, writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { EntryKind } from './state-store';

/** What one entry file holds; the page id is inside because the directory name is only its hash. */
export interface StoredEntry { v: 1; pageId: string; kind: EntryKind; id: string; value: unknown }

export type ReadOutcome = { entry: StoredEntry } | { refused: string } | 'absent' | 'corrupt';

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const ENTRY_RE = /^(ticket|mark)-[A-Za-z0-9_-]{1,80}\.json$/;
export const CLAIMED_RE = /\.json\.claimed\.\d+$/;
export const TEMP_RE = /^\.tmp-/;
export const PAGE_DIR_RE = /^[0-9a-f]{16}$/;
// Marks hold at most a few KB of text; anything far larger was not written by us.
const MAX_ENTRY_BYTES = 1 << 20;

/** Ids come from the command line, so they must never form a path. */
export function isEntryId(id: string): boolean {
  return ID_RE.test(id);
}

export function entryName(kind: EntryKind, id: string): string {
  return `${kind}-${id}.json`;
}

export function pageDirName(pageId: string): string {
  return createHash('sha256').update(pageId, 'utf8').digest('hex').slice(0, 16);
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

/** Creates the directory 0700, and narrows a wider mode on one we own. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = statSync(dir);
  if (!st.isDirectory()) throw new Error(`state path is not a directory: ${dir}`);
  if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}

/** Temp file in the same directory, then rename: a reader never sees a half-written entry. */
export function writeEntry(dir: string, entry: StoredEntry): void {
  const name = entryName(entry.kind, entry.id);
  const tmp = join(dir, `.tmp-${name}.${process.pid}.${randomBytes(4).toString('hex')}`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeSync(fd, JSON.stringify(entry));
  } catch (error) {
    closeSync(fd);
    unlinkQuiet(tmp);
    throw error;
  }
  closeSync(fd);
  try {
    renameSync(tmp, join(dir, name));
  } catch (error) {
    unlinkQuiet(tmp);
    throw error;
  }
}

/**
 * Opens without following a symlink and checks the open descriptor, so the mode, owner and bytes read are of one
 * file. A file another user owns, or that group/other may read, is refused rather than trusted.
 */
export function readEntry(path: string): ReadOutcome {
  let fd: number;
  try {
    // Non-blocking, so a FIFO here cannot hang the open; the fstat below refuses anything but a regular file.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'absent';
    if (code === 'ELOOP' || code === 'EMLINK') return { refused: 'symlink' };
    throw error;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { refused: 'not a regular file' };
    const uid = process.getuid?.();
    if (uid !== undefined && st.uid !== uid) return { refused: `owner uid ${st.uid}` };
    if ((st.mode & 0o077) !== 0) return { refused: `mode ${(st.mode & 0o777).toString(8)}` };
    if (st.size > MAX_ENTRY_BYTES) return { refused: `size ${st.size}` };
    return parseEntry(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

function parseEntry(raw: string): { entry: StoredEntry } | 'corrupt' {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'corrupt';
  }
  if (typeof data !== 'object' || data === null) return 'corrupt';
  const e = data as Record<string, unknown>;
  if (e.v !== 1 || typeof e.pageId !== 'string' || typeof e.id !== 'string') return 'corrupt';
  if (e.kind !== 'ticket' && e.kind !== 'mark') return 'corrupt';
  return { entry: { v: 1, pageId: e.pageId, kind: e.kind, id: e.id, value: e.value } };
}

export function unlinkQuiet(path: string): boolean {
  try {
    unlinkSync(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}
