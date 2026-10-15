import type { OrcaReply } from './orca-reply';

/** One bound `orca` call: the binary and the stripped environment are already fixed. */
export type OrcaRun = (args: readonly string[], timeoutMs: number, onSpawn?: () => void) => Promise<OrcaReply>;
