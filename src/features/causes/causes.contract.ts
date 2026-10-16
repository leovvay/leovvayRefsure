import type { CauseRow, NextDo } from '../../output';

/**
 * `refsure causes --json`: every `why.cause` refsure emits, with its one status and that status's exit, and every
 * `next.do` it emits. Both are open sets (spec §6.1), so this is the installed version's list of each.
 */
export interface CausesResult { causes: (CauseRow & { exit: number })[]; next_do: NextDo[] }
