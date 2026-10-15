import type { Envelope } from '../output';

/** The envelope to print and the exit derived from its status; only `main.ts` calls `process.exit`. */
export interface CommandResult { envelope: Envelope; exit: number }
