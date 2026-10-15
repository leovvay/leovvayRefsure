import type { AnyCommandSpec } from './any-command-spec';
import type { CommandResult } from './command-result';

/** Where the top-level argv goes: a verb, plain text (help, version) or a usage envelope. */
export type ArgvRoute =
  | { kind: 'command'; spec: AnyCommandSpec; argv: string[] }
  | { kind: 'print'; text: string; exit: 0 }
  | { kind: 'unknown'; result: CommandResult };
