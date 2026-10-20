import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { CommandSpec } from './command-spec';
import type { OptionSpec } from './option-spec';
import type { OptionToken } from './option-token';
import type { ParsedArgs } from './parsed-args';
import type { UsageError } from './usage-error';

type ParseOptions = NonNullable<ParseArgsConfig['options']>;
type ParseOption = ParseOptions[string];

/** Accepted by every verb; they win over a verb option of the same name. */
export const GLOBAL_OPTIONS: Readonly<Record<string, OptionSpec>> = {
  page: {
    type: 'string',
    summary: 'Orca page id (your own tab), or agent-browser session name; else REFSURE_PAGE, else the worktree\'s '
      + 'current tab (agent-browser: bg-<first 8 of the Orca terminal handle>, else default)',
  },
  'dry-run': { type: 'boolean', summary: 'Print the exact redacted request; send nothing, do nothing' },
  help: { type: 'boolean', short: 'h', summary: 'Show this command\'s options' },
  json: { type: 'boolean', summary: 'Accepted and ignored: output is one JSON envelope (skill print: the file itself)' },
};

function toParseOption(spec: OptionSpec): ParseOption {
  const option: ParseOption = { type: spec.type };
  if (spec.multiple) option.multiple = true;
  if (spec.short) option.short = spec.short;
  if (spec.default !== undefined) {
    option.default = spec.multiple
      ? (typeof spec.default === 'string' ? [spec.default] : [spec.default])
      : spec.default;
  }
  return option;
}

function plainValues(values: Record<string, unknown>): ParsedArgs['values'] {
  const out: ParsedArgs['values'] = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'boolean') out[name] = value;
    // `multiple` is meant for strings; a repeated boolean reads as set.
    else if (Array.isArray(value)) out[name] = value.every((v) => typeof v === 'string') ? value : true;
  }
  return out;
}

/**
 * A string option given twice, when it takes one value: `parseArgs` keeps the last, so `--ref @e5 --ref @e6`
 * would quietly act on @e6. `null` when every one-value option was given at most once.
 */
function repeatedOption(options: ParseOptions, tokens: readonly { kind: string; name?: string; index: number }[], cut: number): string | null {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option' || token.index >= cut || token.name === undefined) continue;
    const option = options[token.name];
    if (option === undefined || option.type !== 'string' || option.multiple) continue;
    if (seen.has(token.name)) return token.name;
    seen.add(token.name);
  }
  return null;
}

export function isUsageError(value: unknown): value is UsageError {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as { usage?: unknown }).usage === 'string' && Object.keys(value).length === 1;
}

/**
 * `util.parseArgs` in strict mode over the verb's options plus `GLOBAL_OPTIONS`. Everything after the first bare
 * `--` goes to `rest` untouched (the act that `outcome` wraps); positionals are only the ones before it, and so are
 * `tokens`, the options in the order given.
 */
export function parseCommandArgs(
  spec: Pick<CommandSpec<unknown, unknown>, 'options'>,
  argv: readonly string[],
): ParsedArgs | UsageError {
  const options: ParseOptions = {};
  for (const [name, option] of Object.entries({ ...spec.options, ...GLOBAL_OPTIONS })) {
    options[name] = toParseOption(option);
  }
  try {
    const parsed = parseArgs({ args: [...argv], options, strict: true, allowPositionals: true, tokens: true });
    const terminator = parsed.tokens.find((token) => token.kind === 'option-terminator');
    const cut = terminator?.index ?? argv.length;
    const repeated = repeatedOption(options, parsed.tokens, cut);
    if (repeated !== null) return { usage: `--${repeated} takes one value; it was given more than once` };
    // A blank `--page` (an unset "$PAGE") must not fall through to REFSURE_PAGE or the current tab.
    if (typeof parsed.values.page === 'string' && parsed.values.page.trim() === '') {
      return { usage: '--page is empty: pass a page id, or leave --page out' };
    }
    const positionals = parsed.tokens
      .flatMap((token) => (token.kind === 'positional' && token.index < cut ? [token.value] : []));
    const tokens = parsed.tokens.flatMap((token): OptionToken[] => (
      token.kind === 'option' && token.index < cut ? [{ name: token.name, value: token.value }] : []));
    return { values: plainValues(parsed.values), positionals, rest: argv.slice(cut + 1), tokens };
  } catch (error) {
    return { usage: error instanceof Error ? error.message : String(error) };
  }
}
