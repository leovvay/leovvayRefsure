import type { ActAction } from '../../browser';

/** The acts a step may take: every typed act but a double click. */
export type StepAction = Exclude<ActAction, 'dblclick'>;

/**
 * One step of `do`, in command-line order: the act, the target as the agent described it (what `locate` is asked
 * for), and, for a fill or select, the value. The value is never logged, sent, shown, or given to a Decision.
 */
export interface DoStep { action: StepAction; target: string; value?: string }
