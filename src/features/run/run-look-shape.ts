import type { AxTree, TabInfo } from '../../browser';
import type { ElementTable } from './element-table-shape';

/**
 * One look at the page: the tab and the snapshot, the element table, the page text as lines (nothing typed in
 * them), and a signature of what the page shows, which tells whether an act changed it.
 */
export interface RunLook { tab: TabInfo; tree: AxTree; table: ElementTable; lines: string[]; sig: string }
