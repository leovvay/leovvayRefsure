import type { AbReply } from './ab-reply';

/** One bound `agent-browser … batch` call: the commands run in order in one daemon round trip, one reply each. */
export type AbBatchRun = (
  args: readonly string[], commands: readonly (readonly string[])[], timeoutMs: number, onSpawn?: () => void,
) => Promise<AbReply[]>;
