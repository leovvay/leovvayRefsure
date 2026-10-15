import type { ActAction } from '../../browser';

/** What a refused act would have been, for the `act-high-risk` step: the action, its value, and an intent. */
export interface PolicyAct { action: ActAction; value?: string; intent: string | null }
