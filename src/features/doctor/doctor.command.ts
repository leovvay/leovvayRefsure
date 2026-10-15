import type { CommandSpec, UsageError } from '../../cli';
import { basicChecks } from './basic-checks';
import { decisionChecks } from './decision-checks';
import type { DoctorArgs } from './doctor.args';
import type { DoctorResult } from './doctor.contract';
import { pingChecks } from './ping-checks';

/**
 * Health checks. The status is `ok` even when checks fail: doctor reports, and the failed ones are named in
 * `result.failed`. It needs no page, so it runs outside an Orca terminal too.
 */
export const doctorCommand: CommandSpec<DoctorArgs, DoctorResult> = {
  name: 'doctor',
  summary: 'Check Node, Orca, keys, consent, config and model drift; --ping asks each provider once',
  since: '0.1.0',
  stability: 'stable',
  options: {
    ping: { type: 'boolean', summary: 'Ask each configured provider one synthetic presence Decision (consent needed)' },
  },
  needs: { page: 'none', capabilities: [], sites: ['presence'], acts: 'never' },
  parse(raw): DoctorArgs | UsageError {
    if (raw.positionals.length > 0) return { usage: `doctor takes no positional arguments, got ${raw.positionals.length}` };
    return { ping: raw.values.ping === true };
  },
  async run(args, ctx) {
    const checks = [...await basicChecks(ctx), ...await decisionChecks(ctx)];
    if (args.ping) checks.push(...await pingChecks(ctx));
    const failed = checks.filter((check) => !check.ok).map((check) => check.name);
    return { status: 'ok', acted: false, effect: 'none', result: { checks, failed } };
  },
};
