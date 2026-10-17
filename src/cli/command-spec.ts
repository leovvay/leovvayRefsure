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
  /**
   * The invocation shapes, without `refsure <name>`, when options alone do not show them: e.g. the act a verb
   * takes after `--`. Shown in --help and `commands --json`.
   */
  forms?: readonly string[];
  needs: {
    page: 'required' | 'none';
    capabilities: readonly BrowserCapability[];
    sites: readonly SiteId[];
    /**
     * `recheck`: a Decision's pick, found again by fingerprint on a fresh snapshot and guarded as `act` guards a
     * ticket, with no ticket in between (`run`).
     */
    acts: 'never' | 'own-ref' | 'ticket' | 'recheck' | 'high-risk';
  };
  parse(raw: ParsedArgs): Args | UsageError;
  run(args: Args, ctx: CommandContext): Promise<CommandOutcome<Result>>;
}
