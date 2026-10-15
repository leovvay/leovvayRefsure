import type { AnyCommandSpec } from '../cli';
import { causesCommand } from './causes';
import { commandsCommand } from './commands';
import { doctorCommand } from './doctor';
import { guardCommand } from './guard';
import { privacyCommand } from './privacy';
import { setupCommand } from './setup';
import { snapCommand } from './snap';
import { stateCommand } from './state';

/** Every command, in `--help` order. A static list: one bundle, no directory scan. Feature tasks append here. */
export const FEATURES: readonly AnyCommandSpec[] = [
  setupCommand,
  privacyCommand,
  doctorCommand,
  stateCommand,
  snapCommand,
  guardCommand,
  commandsCommand(() => FEATURES),
  causesCommand,
];
