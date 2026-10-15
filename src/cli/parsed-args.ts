export interface ParsedArgs {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
  /** Everything after `--`. */
  rest: string[];
}
