import { lstatSync, lutimesSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RunTrace } from '../output';
import {
  CLAIMED_RE, ENTRY_RE, PAGE_DIR_RE, TEMP_RE, ensureDir, entryName, errorCode, isEntryId, pageDirName, readEntry,
  unlinkQuiet, writeEntry, type StoredEntry,
} from './entry-file';
import type { EntryKind, StateStore } from './state-store';

/** Claimed files and write leftovers are kept this long, then purged. */
const CLAIMED_KEEP_MS = 10 * 60_000;
/**
 * Purge deletes an entry only this long after it expired. Purge runs at the start of every command, so without the
 * margin a ticket claimed a moment late would already be gone and read as `ticket_used`, not `ticket_expired`.
 * Every reader checks expiry itself.
 */
const EXPIRED_KEEP_MS = 10 * 60_000;

/** File-backed StateStore (spec §8.7): `<root>/<sha256(pageId)[:16]>/<kind>-<id>.json`, dirs 0700, files 0600. */
export function createFileStore(root: string, trace?: RunTrace): StateStore {
  const note = (text: string): void => {
    trace?.notes.push(text);
  };

  function pageDirs(): string[] {
    let names: string[];
    try {
      names = readdirSync(root);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
    return names.filter((name) => PAGE_DIR_RE.test(name)).map((name) => join(root, name));
  }

  /** Reads one entry and checks it is the one its path names. A refused file is absent, with a trace note. */
  function load(path: string, dir: string, kind: EntryKind, id: string): StoredEntry | null {
    const read = readEntry(path);
    if (read === 'absent') return null;
    if (read === 'corrupt') {
      note(`corrupt_state_entry: ${entryName(kind, id)}`);
      return null;
    }
    if ('refused' in read) {
      note(`refused_state_mode: ${entryName(kind, id)} (${read.refused})`);
      return null;
    }
    const { entry } = read;
    if (entry.kind !== kind || entry.id !== id || pageDirName(entry.pageId) !== basename(dir)) {
      note(`corrupt_state_entry: ${entryName(kind, id)}`);
      return null;
    }
    return entry;
  }

  function olderThan(path: string, nowMs: number, keepMs: number): boolean {
    return nowMs - lstatSync(path).mtimeMs > keepMs;
  }

  function rmdirQuiet(dir: string): void {
    try {
      rmdirSync(dir);
    } catch {
      // Not empty, already gone, or raced by a concurrent put: all fine to leave.
    }
  }

  function clearDir(dir: string): number {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 0;
      throw error;
    }
    let removed = 0;
    for (const name of names) {
      try {
        if (unlinkQuiet(join(dir, name)) && ENTRY_RE.test(name)) removed += 1;
      } catch (error) {
        note(`state_clear_failed: ${name} ${errorCode(error) ?? 'error'}`);
      }
    }
    rmdirQuiet(dir);
    return removed;
  }

  function purgeDir(dir: string, nowMs: number, expiresAt: (value: unknown) => number | null): void {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return;
      throw error;
    }
    for (const name of names) {
      const path = join(dir, name);
      try {
        if (TEMP_RE.test(name) || CLAIMED_RE.test(name)) {
          if (olderThan(path, nowMs, CLAIMED_KEEP_MS)) unlinkQuiet(path);
          continue;
        }
        if (!ENTRY_RE.test(name)) continue;
        // Purge stays quiet about refused files: find and claim note them when they matter.
        const read = readEntry(path);
        if (read === 'absent' || (typeof read === 'object' && 'refused' in read)) continue;
        if (read === 'corrupt') {
          if (olderThan(path, nowMs, CLAIMED_KEEP_MS)) unlinkQuiet(path);
          continue;
        }
        const expiry = expiresAt(read.entry.value);
        if (expiry !== null && nowMs >= expiry + EXPIRED_KEEP_MS) unlinkQuiet(path);
      } catch (error) {
        note(`state_purge_failed: ${name} ${errorCode(error) ?? 'error'}`);
      }
    }
    rmdirQuiet(dir);
  }

  return {
    async put(pageId, kind, id, value) {
      if (!isEntryId(id)) throw new Error(`invalid state id: ${JSON.stringify(id)}`);
      const dir = join(root, pageDirName(pageId));
      const entry: StoredEntry = { v: 1, pageId, kind, id, value };
      // A concurrent purge may rmdir the empty page directory between ensureDir and the write; one retry covers it.
      for (let attempt = 0; ; attempt += 1) {
        ensureDir(root);
        ensureDir(dir);
        try {
          writeEntry(dir, entry);
          return;
        } catch (error) {
          if (attempt > 0 || errorCode(error) !== 'ENOENT') throw error;
        }
      }
    },

    async find(kind, id) {
      if (!isEntryId(id)) return null;
      for (const dir of pageDirs()) {
        const entry = load(join(dir, entryName(kind, id)), dir, kind, id);
        if (entry) return { pageId: entry.pageId, value: entry.value };
      }
      return null;
    },

    async claim(kind, id) {
      if (!isEntryId(id)) return 'gone';
      for (const dir of pageDirs()) {
        const file = join(dir, entryName(kind, id));
        const claimed = `${file}.claimed.${process.pid}`;
        // rename(2) is atomic: of two racing claimers exactly one moves the file, the other gets ENOENT.
        try {
          renameSync(file, claimed);
        } catch (error) {
          if (errorCode(error) === 'ENOENT') continue;
          throw error;
        }
        // rename keeps the write time; stamp the claim time at once so purge ages the claimed file from the claim.
        try {
          const at = new Date();
          lutimesSync(claimed, at, at);
        } catch {
          // A vanished file reads as absent below.
        }
        const entry = load(claimed, dir, kind, id);
        return entry ? { pageId: entry.pageId, value: entry.value } : 'gone';
      }
      return 'gone';
    },

    async clearPage(pageId) {
      return clearDir(join(root, pageDirName(pageId)));
    },

    async clearAll() {
      let removed = 0;
      for (const dir of pageDirs()) removed += clearDir(dir);
      return removed;
    },

    async purge(nowMs, expiresAt) {
      for (const dir of pageDirs()) purgeDir(dir, nowMs, expiresAt);
    },
  };
}
