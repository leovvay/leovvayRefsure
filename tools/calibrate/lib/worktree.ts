/** The `id:<worktree>` selector refsure passes to Orca, from ORCA_WORKTREE_ID; the replay needs one. */
export function worktreeSelectorOf(env: NodeJS.ProcessEnv): string {
  const id = env.ORCA_WORKTREE_ID?.trim();
  if (!id) throw new Error('ORCA_WORKTREE_ID is not set: run the Orca-native replay from an Orca terminal');
  return `id:${id}`;
}
