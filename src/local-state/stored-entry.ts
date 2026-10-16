import type { EntryKind } from './state-store';

/** What one entry file holds; the page id is inside because the directory name is only its hash. */
export interface StoredEntry { v: 1; pageId: string; kind: EntryKind; id: string; value: unknown }

export type ReadOutcome = { entry: StoredEntry } | { refused: string } | 'absent' | 'corrupt';
