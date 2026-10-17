import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Candidate, candidatesOf, pageLines } from '../../page-model';
import { countEditable } from '../shared';
import type { ElementTable, TableHints } from './element-table-shape';
import { elementTable, unsettledFields } from './element-table';
import type { RunLook } from './run-look-shape';

/**
 * A look from a snapshot already read (the recheck's, the blocker level's): no page call. `cands` when already read
 * off the same tree.
 */
export function lookOf(
  tab: TabInfo, tree: AxTree, hints: TableHints, cands: readonly Candidate[] = candidatesOf(tree),
): RunLook {
  const table: ElementTable = elementTable(tree, cands, hints);
  const lines = pageLines(tree);
  // What the page shows a person and the agent: its address, the table (values and states in it) and its text.
  const sig = [tab.url, ...table.rows.map((row) => row.text), '', ...lines].join('\n');
  return { tab, tree, table, lines, sig };
}

/**
 * Settles the value fields whose value a row would show and that nothing yet tells apart from an editable region
 * (a `role="textbox"` contenteditable prints as a plain textbox, and its text is never sent: spec §7.3). One count
 * of the page's editable regions does it, once per field: none means each is an `<input>`, whose value rows show;
 * any means each stays withheld. A count that cannot be read settles nothing, and the rows withhold the values.
 */
async function settleFields(
  ctx: CommandContext, page: PageRef, tree: AxTree, cands: readonly Candidate[], hints: TableHints,
): Promise<void> {
  const open = unsettledFields(tree, cands, hints);
  if (open.length === 0) return;
  const regions = await countEditable(ctx.browser, page);
  if (regions === null) return;
  for (const key of open) hints.kinds.set(key, regions === 0 ? 'input' : 'withheld');
}

/**
 * One look: the tab and one snapshot, read together (the tab is a cheap call; the snapshot is the page call), and
 * a field it shows for the first time settled (`settleFields`).
 */
export async function look(ctx: CommandContext, page: PageRef, hints: TableHints): Promise<RunLook> {
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const cands = candidatesOf(tree);
  await settleFields(ctx, page, tree, cands, hints);
  return lookOf(tab, tree, hints, cands);
}
