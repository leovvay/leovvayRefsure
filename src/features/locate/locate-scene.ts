import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { Candidate } from '../../page-model';

/** One look a pick is made on: the page, its tab, the snapshot, and the candidates offered from it. */
export interface LocateScene { page: PageRef; tab: TabInfo; tree: AxTree; cands: readonly Candidate[] }
