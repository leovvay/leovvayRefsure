import { closeSync, constants, fstatSync, openSync, readSync, writeSync } from 'node:fs';
import type { EgressLogEntry } from './egress-log-entry';
import { ensureParentDir } from './private-file';

// Covers a full day at the default per-minute cap; the limits never look further back.
const MAX_READ_BYTES = 16 * 1024 * 1024;
const PROVIDERS: ReadonlySet<string> = new Set(['jev', 'openai']);

/**
 * Appends one JSON line (file mode 0600, directory 0700). Only the entry's known fields are written, so
 * nothing else an object carries can reach the log. False when the line could not be written.
 */
export function appendEgressLog(path: string, entry: EgressLogEntry): boolean {
  const { t, command, site, provider, host, bytes, digest, status, usd, model } = entry;
  const line = JSON.stringify({ t, command, site, provider, host, bytes, digest, status, usd, model });
  try {
    ensureParentDir(path);
    // Non-blocking: opening a FIFO with no reader then fails at once (ENXIO) instead of hanging.
    const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NONBLOCK, 0o600);
    try {
      if (!fstatSync(fd).isFile()) return false;
      writeSync(fd, `${line}\n`);
      return true;
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function asEntry(value: unknown): EgressLogEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const ok = typeof v.t === 'number' && Number.isFinite(v.t) && typeof v.command === 'string'
    && typeof v.site === 'string' && typeof v.provider === 'string' && PROVIDERS.has(v.provider)
    && typeof v.host === 'string' && typeof v.bytes === 'number' && typeof v.digest === 'string'
    && typeof v.status === 'string' && (v.usd === null || typeof v.usd === 'number')
    && (v.model === null || typeof v.model === 'string');
  return ok ? (v as unknown as EgressLogEntry) : null;
}

function readTail(path: string): string {
  let fd: number;
  try {
    // Non-blocking, so a FIFO here cannot hang the open; only a regular file is read.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch {
    return '';
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return '';
    const size = stat.size;
    const length = Math.min(size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const got = readSync(fd, buffer, read, length - read, size - length + read);
      if (got === 0) break;
      read += got;
    }
    const text = buffer.subarray(0, read).toString('utf8');
    // A tail that starts mid-file starts mid-line; that first piece is not an entry.
    return length < size ? text.slice(text.indexOf('\n') + 1) : text;
  } catch {
    return '';
  } finally {
    closeSync(fd);
  }
}

/** Entries with `t >= sinceMs`, oldest first. A missing log is empty; an unreadable line is skipped. */
export function readEgressLog(path: string, sinceMs: number): EgressLogEntry[] {
  const entries: EgressLogEntry[] = [];
  for (const line of readTail(path).split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = asEntry(parsed);
    if (entry && entry.t >= sinceMs) entries.push(entry);
  }
  return entries;
}
