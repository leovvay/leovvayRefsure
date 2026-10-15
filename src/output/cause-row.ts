import type { Status } from './status';

/** One row of `refsure causes --json`: a `why.cause` value and the one status it always comes with. */
export interface CauseRow { cause: string; status: Status; summary: string }
