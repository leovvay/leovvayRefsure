import type { Envelope } from '../output';

/**
 * The envelope to print and the exit derived from its status; only `main.ts` calls `process.exit`. `text`, when
 * set, is printed verbatim instead of the envelope (an `ok` outcome's `text`).
 */
export interface CommandResult { envelope: Envelope; exit: number; text?: string }
