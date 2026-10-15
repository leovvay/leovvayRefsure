import type { AbReply } from './ab-reply';

/** One bound `agent-browser` call: the binary and the stripped environment are already fixed. */
export type AbRun = (args: readonly string[], timeoutMs: number, onSpawn?: () => void) => Promise<AbReply>;
