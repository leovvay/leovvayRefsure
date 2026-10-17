import type { CommandOutcome } from '../../cli';

/** Where `do` stopped: the step's index and its own verb's outcome (`locate`'s or `act`'s), as that verb gave it. */
export interface StepStop { index: number; outcome: CommandOutcome<unknown> }
