import type { AxTree, PageRef } from '../browser';
import type { TrailRow } from './trail-spec';

/** The reads since the previous row on a page: when the first began (epoch ms), their total ms, the last node count. */
export interface TrailDraft { at: number; read: number; nodes: number | null }

/** A row as this process keeps it, with the origin it was made on: its element name is sent only there. */
export interface KeptRow { row: TrailRow; origin: string | null }

/**
 * What the recorder holds for one page in one process: the origin and tree of its last snapshot (an act's role and
 * name by ref, never a value), the reads not yet in a row, this process's rows on it (the newest 12), and whether a
 * row changed since the last draw call was handed out. Nothing of it outlives the process: the page keeps history.
 */
export interface TrailBook {
  page: PageRef;
  origin: string | null;
  tree: AxTree | null;
  draft: TrailDraft | null;
  rows: KeptRow[];
  changed: boolean;
}
