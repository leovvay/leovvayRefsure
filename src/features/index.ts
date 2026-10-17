import type { AnyCommandSpec } from '../cli';
import { actCommand } from './act';
import { actHighRiskCommand } from './act-high-risk';
import { causesCommand } from './causes';
import { commandsCommand } from './commands';
import { dismissCommand } from './dismiss';
import { doCommand } from './do';
import { doctorCommand } from './doctor';
import { forgetCommand } from './forget';
import { guardCommand } from './guard';
import { locateCommand } from './locate';
import { markCommand } from './mark';
import { outcomeCommand } from './outcome';
import { pickOptionCommand } from './pick-option';
import { privacyCommand } from './privacy';
import { runCommand } from './run';
import { setupCommand } from './setup';
import { skillCommand } from './skill';
import { snapCommand } from './snap';
import { stateCommand } from './state';
import { triageCommand } from './triage';
import { verifyTargetCommand } from './verify-target';
import { waitForCommand } from './wait-for';

/** Every command, in `--help` order. A static list: one bundle, no directory scan. A new command is added here. */
export const FEATURES: readonly AnyCommandSpec[] = [
  setupCommand,
  privacyCommand,
  doctorCommand,
  stateCommand,
  doCommand,
  runCommand,
  locateCommand,
  actCommand,
  dismissCommand,
  outcomeCommand,
  waitForCommand,
  markCommand,
  snapCommand,
  guardCommand,
  verifyTargetCommand,
  pickOptionCommand,
  actHighRiskCommand,
  triageCommand,
  forgetCommand,
  commandsCommand(() => FEATURES),
  causesCommand,
  skillCommand,
];
