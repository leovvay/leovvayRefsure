/** What a snapshot reply carries, before parsing. */
export interface SnapshotBody {
  text: string;
  origin: string;
  /**
   * The reply's `refs` map (`eN` → role and name), or null when the reply has none (a bare snapshot string).
   * A field the entry lacks is null. It is the one part of the reply a page's text cannot forge.
   */
  refs: ReadonlyMap<string, { role: string | null; name: string | null }> | null;
}
