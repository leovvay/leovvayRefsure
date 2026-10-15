import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import { namedPage } from '../named-page';
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
  const named = namedPage(hint, env);
  if (named) return { backend: 'orca', id: named };
  const result = await currentTab(worktree);
  const tab = isRecord(result) && isRecord(result.tab) ? result.tab : null;
  const id = tab && typeof tab.browserPageId === 'string' ? tab.browserPageId.trim() : '';
  if (!id) throw new BrowserError('no_tab', 'no browser tab is open in this worktree');
  return { backend: 'orca', id };
}
