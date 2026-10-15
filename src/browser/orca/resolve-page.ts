import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import type { PageHint } from '../page-hint';
import type { PageRef } from '../page-ref';
import { worktreeSelector } from './worktree-guard';

/** Spec §6.1 page target: `--page`, then `REFSURE_PAGE`, then the worktree's current tab. */
export async function resolveOrcaPage(
  hint: PageHint,
  env: NodeJS.ProcessEnv,
  /** Reads `orca tab current --worktree …`; injected so only the adapter spawns. */
  currentTab: (worktree: string) => Promise<unknown>,
): Promise<PageRef> {
  const worktree = worktreeSelector(env);
  // A given `--page` is final: a blank one never falls through to another tab (the registry refuses it first).
  if (hint.page !== undefined) {
    const id = hint.page.trim();
    if (!id) throw new BrowserError('no_tab', '--page is empty');
    return { backend: 'orca', id };
  }
  const named = env.REFSURE_PAGE?.trim();
  if (named) return { backend: 'orca', id: named };
  const result = await currentTab(worktree);
  const tab = isRecord(result) && isRecord(result.tab) ? result.tab : null;
  const id = tab && typeof tab.browserPageId === 'string' ? tab.browserPageId.trim() : '';
  if (!id) throw new BrowserError('no_tab', 'no browser tab is open in this worktree');
  return { backend: 'orca', id };
}
