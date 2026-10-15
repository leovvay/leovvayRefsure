import type { AnyCommandSpec } from '../cli';
import { actCommand } from './act';
import { causesCommand } from './causes';
import { commandsCommand } from './commands';
import { dismissCommand } from './dismiss';
import { doctorCommand } from './doctor';
import { guardCommand } from './guard';
import { locateCommand } from './locate';
import { markCommand } from './mark';
import { outcomeCommand } from './outcome';
import { privacyCommand } from './privacy';
import { setupCommand } from './setup';
import { snapCommand } from './snap';
import { stateCommand } from './state';
import { waitForCommand } from './wait-for';

/** Every command, in `--help` order. A static list: one bundle, no directory scan. Feature tasks append here. */
export const FEATURES: readonly AnyCommandSpec[] = [
  setupCommand,
  privacyCommand,
  doctorCommand,
  stateCommand,
  locateCommand,
  actCommand,
  dismissCommand,
  outcomeCommand,
  waitForCommand,
  markCommand,
  snapCommand,
  guardCommand,
  commandsCommand(() => FEATURES),
  causesCommand,
];
