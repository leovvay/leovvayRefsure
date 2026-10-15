import type { CauseRow } from '../../output';

/** `refsure causes --json`: every `why.cause` refsure emits, with its one status and that status's exit. */
export interface CausesResult { causes: (CauseRow & { exit: number })[] }
