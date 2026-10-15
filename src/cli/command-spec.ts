import type { BrowserCapability } from '../browser';
import type { SiteId } from '../questions';
import type { CommandContext } from './command-context';
import type { CommandOutcome } from './command-outcome';
import type { OptionSpec } from './option-spec';
import type { ParsedArgs } from './parsed-args';
import type { UsageError } from './usage-error';

/** One verb (spec §5.2). A command never sets an exit code; the registry derives it from `status`. */
export interface CommandSpec<Args, Result> {
  name: string;
  summary: string;
  since: string;
  stability: 'stable' | 'experimental';
  /** Feeds util.parseArgs, --help and `commands --json`. */
  options: Readonly<Record<string, OptionSpec>>;
  needs: {
    page: 'required' | 'none';
    capabilities: readonly BrowserCapability[];
    sites: readonly SiteId[];
    acts: 'never' | 'own-ref' | 'ticket' | 'high-risk';
  };
  parse(raw: ParsedArgs): Args | UsageError;
  run(args: Args, ctx: CommandContext): Promise<CommandOutcome<Result>>;
}
