import type { OptionToken } from './option-token';

export interface ParsedArgs {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
  /** Everything after `--`. */
  rest: string[];
  /** Every option before `--`, in command-line order (globals included). */
  tokens: OptionToken[];
}
