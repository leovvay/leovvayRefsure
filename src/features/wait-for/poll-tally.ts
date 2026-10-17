/**
 * One wait's count. `decisions` counts provider calls; `answered`, Decisions a provider actually answered (present
 * or not); `withheld`, polls whose text was withheld (`typedWithheld`), which no Decision is asked on.
 */
export interface PollTally { polls: number; decisions: number; answered: number; withheld: number; started: number }
