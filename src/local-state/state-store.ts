export type EntryKind = 'ticket' | 'mark';

/** File-backed local state (spec §8.7): one file per entry, 0600, atomic writes, claim by rename. */
export interface StateStore {
  put(pageId: string, kind: EntryKind, id: string, value: unknown): Promise<void>;
  find(kind: EntryKind, id: string): Promise<{ pageId: string; value: unknown } | null>;
  /** Atomic: exactly one concurrent caller gets the value; the rest get `'gone'`. */
  claim(kind: EntryKind, id: string): Promise<{ pageId: string; value: unknown } | 'gone'>;
  clearPage(pageId: string): Promise<number>;
  clearAll(): Promise<number>;
  /** How many entries one page holds, or every page: what `clearPage` or `clearAll` would remove. */
  count(scope: { pageId: string } | 'all'): Promise<number>;
  /**
   * Deletes expired entries and old claimed files. `expiresAt` returns an entry's expiry time in ms, or null to keep
   * it; an entry is removed EXPIRED_KEEP_MS (10 min) after that time, so a late claim still reads as expired.
   */
  purge(nowMs: number, expiresAt: (value: unknown) => number | null): Promise<void>;
}
