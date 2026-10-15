import type { PageRef, TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { cutName, norm } from '../../page-model';
import { outcomeSite } from '../../questions';
import { actionPolicy, actionRole, liveRefRisk, nameCheck, readLiveTarget } from '../../risk';
import type { RiskReading } from '../../risk';
import { abstainOutcome, highRiskNext } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';

/**
 * What the guard learned: `acted` for the Decision's `acted_element` (e.g. `button "Save"`), the risk read, and the
 * body text read before the act, which is the outcome's before-side.
 */
type Cleared = { acted: string; risk: RiskReading; bodyText: string };

type Checked = { refusal: CommandOutcome<OutcomeResult> } | { cleared: Cleared };

function refused(status: 'refused' | 'stale', cause: string, detail: string, next: CommandOutcome<never>['next']): Checked {
  const refusal: CommandOutcome<OutcomeResult> = { status, acted: false, effect: 'none', result: null, why: { cause, detail } };
  if (next) refusal.next = next;
  return { refusal };
}

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
  const verdict = { kind: 'abstain' as const, cause: route.cause, detail: route.detail, leaned: null, confidence: null, threshold: null };
  return { refusal: abstainOutcome<OutcomeResult>(verdict, null) };
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
  const { live, role, bodyText } = target;
  const named = nameCheck(live, args.expectName);
  if (named !== 'ok') {
    ctx.trace.untrusted.add('why.detail');
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    return refused('stale', 'expect_name_mismatch', `@${ref} shows ${shown}, not ${JSON.stringify(args.expectName)}; nothing was done`,
      { do: 'snapshot', argv: ['refsure', 'snap'] });
  }

  const risk: RiskReading = await liveRefRisk(ctx.browser, page, ref, action, target, {
    url: tab.url, ...(args.risk ? { userRisk: args.risk } : {}),
  });
  if (actionPolicy(action, risk.class, 'outcome') !== 'allow') {
    // The caller's own ref, name and intent: the one command that may take it, spelled out (spec §6.3).
    const next = highRiskNext({
      class: risk.class, via: { ref, expectName: args.expectName }, action, intent: args.intent,
      ...(args.act.value === undefined ? {} : { value: args.act.value }),
      ...(args.risk ? { risk: args.risk } : {}),
    });
    return refused('refused', 'high_risk_class',
      `${risk.class} (${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or consent; nothing was done. `
        + 'Only act-high-risk takes it, and only when the human asked for exactly this', next);
  }
  return { cleared: { acted: `${role ?? actionRole(action)} ${JSON.stringify(cutName(norm(live.seen)))}`, risk, bodyText } };
}
