import type { PageRef, TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { describeElement } from '../../page-model';
import { outcomeSite } from '../../questions';
import { actionRole, liveRefRisk, nameCheck, readLiveTarget, refusesHighRisk } from '../../risk';
import type { RiskReading } from '../../risk';
import { abstainOutcome, highRiskNext, nothingDone } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';

/**
 * What the guard learned: `acted` for the Decision's `acted_element` (e.g. `button "Save"`). The body text it read
 * fed only the confirm-dialog raiser; the outcome's before-side is read after every check (spec §6.2).
 */
type Cleared = { acted: string };

type Checked = { refusal: CommandOutcome<OutcomeResult> } | { cleared: Cleared };

/**
 * The route check, before anything is read or done. Any refusal stops the act, with one exception: over the spend
 * cap, an act that `--expect-url` or `--expect-text` can confirm by code still runs, with a note, since only its
 * Decision would have been refused. Without a code rule it could only end `effect_unknown`, so it never starts.
 */
async function routeRefusal(ctx: CommandContext, args: OutcomeWrapArgs, tab: TabInfo): Promise<Checked | null> {
  const route = await ctx.routeCheck(outcomeSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
  if (route.ok) return null;
  if (route.cause === 'spend_limit' && (args.expectUrl !== null || args.expectText !== null)) {
    ctx.trace.notes.push(`spend_limit: only --expect-url/--expect-text can confirm this act (${route.detail})`);
    return null;
  }
  return { refusal: abstainOutcome<OutcomeResult>(route, null) };
}

/**
 * Every check that can refuse, before anything is dispatched (spec §6.1, §6.2, §8.3 live-ref path), in order:
 * route (keys, consent, provider allowlist, origin, spend caps), so `not_set_up` never comes after the click; the
 * names the live ref shows; the risk read without a snapshot (every name, path `""`, the raisers, a confirm dialog
 * that may be open, `--risk`); the outcome route's action policy, which refuses money, irreversible, auth and consent.
 */
export async function checkBeforeAct(
  ctx: CommandContext, page: PageRef, args: OutcomeWrapArgs, tab: TabInfo,
): Promise<Checked> {
  const stop = await routeRefusal(ctx, args, tab);
  if (stop) return stop;

  const { action, ref } = args.act;
  const target = await readLiveTarget(ctx.browser, page, ref, action);
  const { live, role } = target;
  const named = nameCheck(live, args.expectName);
  if (named !== 'ok') {
    ctx.trace.untrusted.add('why.detail');
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    const detail = `@${ref} shows ${shown}, not ${JSON.stringify(args.expectName)}; nothing was done`;
    return { refusal: nothingDone('stale', 'expect_name_mismatch', detail, { next: RE_OBSERVE }) };
  }

  const risk: RiskReading = await liveRefRisk(ctx.browser, page, ref, action, target, {
    url: tab.url, ...(args.risk ? { userRisk: args.risk } : {}),
  });
  if (refusesHighRisk(risk.class)) {
    // The caller's own ref, name and intent: the one command that may take it, spelled out (spec §6.3).
    const next = highRiskNext({
      class: risk.class, via: { ref, expectName: args.expectName }, action, intent: args.intent,
      ...(args.act.value === undefined ? {} : { value: args.act.value }),
      ...(args.risk ? { risk: args.risk } : {}),
    });
    const detail = `${risk.class} (${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or `
      + 'consent; nothing was done. Only act-high-risk takes it, and only when the human asked for exactly this';
    return { refusal: nothingDone('refused', 'high_risk_class', detail, { next }) };
  }
  return { cleared: { acted: describeElement(role ?? actionRole(action), live.seen) } };
}
