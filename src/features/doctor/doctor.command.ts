import type { CommandSpec, UsageError } from '../../cli';
import { basicChecks } from './basic-checks';
import type { DoctorResult } from './doctor.contract';

/**
 * Health checks. The status is `ok` even when checks fail: doctor reports, and the failed ones are named in
 * `result.failed`. It needs no page, so it runs outside an Orca terminal too.
 */
export const doctorCommand: CommandSpec<Record<string, never>, DoctorResult> = {
  name: 'doctor',
  summary: 'Check Node, the Orca binary and app, browser features and the Orca terminal',
  since: '0.1.0',
  stability: 'stable',
  options: {},
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw): Record<string, never> | UsageError {
    if (raw.positionals.length > 0) return { usage: `doctor takes no arguments, got ${raw.positionals.length}` };
    return {};
  },
  async run(_args, ctx) {
    const checks = await basicChecks(ctx);
    const failed = checks.filter((check) => !check.ok).map((check) => check.name);
    return { status: 'ok', acted: false, effect: 'none', result: { checks, failed } };
  },
};
