import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Candidate, candidatesOf, pageLines } from '../../page-model';
import type { ElementTable, TableHints } from './element-table-shape';
import { elementTable } from './element-table';
import type { RunLook } from './run-look-shape';

/** A look from a snapshot already read (the recheck's, the blocker level's): no page call. */
export function lookOf(tab: TabInfo, tree: AxTree, hints: TableHints): RunLook {
  const cands: Candidate[] = candidatesOf(tree);
  const table: ElementTable = elementTable(tree, cands, hints);
  const lines = pageLines(tree);
  // What the page shows a person and the agent: its address, the table (values and states in it) and its text.
  const sig = [tab.url, ...table.rows.map((row) => row.text), '', ...lines].join('\n');
  return { tab, tree, table, lines, sig };
}

/** One look: the tab and one snapshot, read together (the tab is a cheap call; the snapshot is the page call). */
export async function look(ctx: CommandContext, page: PageRef, hints: TableHints): Promise<RunLook> {
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  return lookOf(tab, tree, hints);
}
