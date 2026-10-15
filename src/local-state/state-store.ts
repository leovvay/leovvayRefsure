export type EntryKind = 'ticket' | 'mark';

/** File-backed local state (spec §8.7): one file per entry, 0600, atomic writes, claim by rename. */
export interface StateStore {
  put(pageId: string, kind: EntryKind, id: string, value: unknown): Promise<void>;
  find(kind: EntryKind, id: string): Promise<{ pageId: string; value: unknown } | null>;
  /** Atomic: exactly one concurrent caller gets the value; the rest get `'gone'`. */
  claim(kind: EntryKind, id: string): Promise<{ pageId: string; value: unknown } | 'gone'>;
  clearPage(pageId: string): Promise<number>;
  clearAll(): Promise<number>;
  /** Deletes expired entries (`ttlOf` returns the expiry time in ms, or null to keep) and old claimed files. */
  purge(nowMs: number, expiresAt: (value: unknown) => number | null): Promise<void>;
}
