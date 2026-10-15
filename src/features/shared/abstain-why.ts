import type { AbstainCause } from '../../questions';

/** Why no answer came: an abstain's cause, with its row in the cause table, and what it says. */
export interface AbstainWhy { cause: AbstainCause; detail: string }
