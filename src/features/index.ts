import type { AnyCommandSpec } from '../cli';
import { causesCommand } from './causes';
import { commandsCommand } from './commands';
import { doctorCommand } from './doctor';
import { guardCommand } from './guard';
import { snapCommand } from './snap';

/** Every command, in `--help` order. A static list: one bundle, no directory scan. Feature tasks append here. */
export const FEATURES: readonly AnyCommandSpec[] = [
  doctorCommand,
  snapCommand,
  guardCommand,
  commandsCommand(() => FEATURES),
  causesCommand,
];
