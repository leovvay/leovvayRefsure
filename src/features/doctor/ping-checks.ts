import type { CommandContext } from '../../cli';
import { keySet } from '../../config';
import { DryRunStop } from '../../output';
import { providerRoster } from '../../providers';
import { presenceSite } from '../../questions';
import type { ProviderId } from '../../questions';
import type { DoctorCheck } from './doctor-check';

/** A fixed synthetic page: nothing from a browser is sent by a ping. `.invalid` never resolves. */
const PING_INPUT = { expectation: 'a greeting', pageUrl: 'https://ping.refsure.invalid/', page: 'Welcome back, Ada' };

async function pingOne(ctx: CommandContext, id: ProviderId): Promise<DoctorCheck> {
  const before = ctx.trace.decisions.length;
  const { verdict } = await ctx.decide(presenceSite, PING_INPUT, {
    combo: id, originUrl: PING_INPUT.pageUrl, dryRun: ctx.dryRun, signal: ctx.signal,
  });
  const info = ctx.trace.decisions.length > before ? ctx.trace.decisions.at(-1) : undefined;
  const by = info ? ` by ${info.model} in ${info.ms} ms` : '';
  if (verdict.kind === 'answer') return { name: `ping_${id}`, ok: true, detail: `present at ${verdict.confidence}${by}` };
  // A valid answer under the band still proves the route works; a provider or setup failure does not.
  const replied = verdict.cause === 'low_confidence' || verdict.cause === 'none_chosen';
  return { name: `ping_${id}`, ok: replied, detail: `${verdict.cause}: ${verdict.detail}${by}` };
}

/**
 * `doctor --ping`: one synthetic presence Decision per configured provider, through the full pipeline (consent
 * included). Under `--dry-run` every ping's body is collected before the dry run stops.
 */
export async function pingChecks(ctx: CommandContext): Promise<DoctorCheck[]> {
  const roster = providerRoster(ctx.config, keySet(ctx.config, ctx.env));
  const checks: DoctorCheck[] = [];
  let stopped: DryRunStop | null = null;
  for (const slot of Object.values(roster)) {
    if (slot.problem !== null) {
      checks.push({ name: `ping_${slot.id}`, ok: false, detail: `not pinged: ${slot.problem}` });
      continue;
    }
    try {
      checks.push(await pingOne(ctx, slot.id));
    } catch (error) {
      if (!(error instanceof DryRunStop)) throw error;
      stopped = error;
    }
  }
  if (stopped) throw stopped;
  return checks;
}
