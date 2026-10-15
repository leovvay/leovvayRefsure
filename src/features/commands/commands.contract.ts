import type { OptionSpec } from '../../cli';
import type { CommandEntry } from './command-entry';

/** `refsure commands --json`: every verb in `--help` order, plus the options every verb accepts. */
export interface CommandsResult {
  commands: CommandEntry[];
  global_options: Readonly<Record<string, OptionSpec>>;
}
