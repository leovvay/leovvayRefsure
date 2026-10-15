import { BrowserError } from '../browser-error';
import type { PageRef } from '../page-ref';

/**
 * Spec §5.2: page work needs the worktree of the Orca terminal it runs in. There is no fallback, so a page id from
 * `--page` or `REFSURE_PAGE` can never steer refsure into another worktree's tabs.
 */
export function worktreeSelector(env: NodeJS.ProcessEnv): string {
  const id = env.ORCA_WORKTREE_ID?.trim();
  if (!id) {
    throw new BrowserError('not_in_orca_terminal', 'ORCA_WORKTREE_ID is not set: run refsure from an Orca terminal');
  }
  return `id:${id}`;
}

/** `--flag=value` keeps a value that starts with `--` from being read as a flag by Orca's parser. */
export function pageArgs(page: PageRef, env: NodeJS.ProcessEnv): string[] {
  return [`--page=${page.id}`, `--worktree=${worktreeSelector(env)}`];
}
