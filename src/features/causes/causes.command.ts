import type { CommandSpec, UsageError } from '../../cli';
import { CAUSES, exitFor, NEXT_DO } from '../../output';
import type { CausesResult } from './causes.contract';

/**
 * The cause table and the `next.do` values (spec §6.1) as data, so an agent or the skill's troubleshooting table can
 * read the installed version's open sets.
 */
export const causesCommand: CommandSpec<Record<string, never>, CausesResult> = {
  name: 'causes',
  summary: 'List every why.cause with its status and exit code, and every next.do',
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
    return { status: 'ok', acted: false, effect: 'none', result: { causes, next_do: [...NEXT_DO] } };
  },
};
