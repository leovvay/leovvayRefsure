import type { CommandSpec, UsageError } from '../../cli';
import { CAUSES, exitFor } from '../../output';
import type { CausesResult } from './causes.contract';

/** The cause table (spec §6.1) as data, so an agent or the skill's troubleshooting table can read it. */
export const causesCommand: CommandSpec<Record<string, never>, CausesResult> = {
  name: 'causes',
  summary: 'List every why.cause with its status and exit code',
  since: '0.1.0',
  stability: 'stable',
  options: {},
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw): Record<string, never> | UsageError {
    if (raw.positionals.length > 0) return { usage: `causes takes no arguments, got ${raw.positionals.length}` };
    return {};
  },
  async run() {
    const causes = CAUSES.map((row) => ({ ...row, exit: exitFor(row.status) }));
    return { status: 'ok', acted: false, effect: 'none', result: { causes } };
  },
};
