import type { BrowserPort, PageRef, Ref, TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { cutName, norm } from '../../page-model';
import { outcomeSite } from '../../questions';
import {
  actionPolicy, actionRole, classifyNames, fieldRaisers, maxRisk, nameCheck, pageRaisers, readLiveName,
} from '../../risk';
import type { RiskReading } from '../../risk';
import { abstainOutcome } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';

const CLICKS: ReadonlySet<string> = new Set(['click', 'dblclick']);

/** What the guard learned: `acted` for the Decision's `acted_element` (e.g. `button "Save"`), and the risk read. */
type Cleared = { acted: string; risk: RiskReading };

type Checked = { refusal: CommandOutcome<OutcomeResult> } | { cleared: Cleared };

function refused(status: 'refused' | 'stale', cause: string, detail: string, next: CommandOutcome<never>['next']): Checked {
  const refusal: CommandOutcome<OutcomeResult> = { status, acted: false, effect: 'none', result: null, why: { cause, detail } };
  if (next) refusal.next = next;
  return { refusal };
}

/** The element's role when it says one, `link` when it has an href; else null (the action's role is used). */
async function pageRole(port: BrowserPort, page: PageRef, ref: Ref): Promise<string | null> {
  if (port.attr === undefined || !port.features().has('attr')) return null;
  const [role, href] = await Promise.all([port.attr(page, ref, 'role'), port.attr(page, ref, 'href')]);
  const given = role === null ? '' : norm(role).toLowerCase().split(' ')[0] ?? '';
  if (/^[a-z]{2,30}$/.test(given)) return given;
  return href !== null && href.trim() !== '' ? 'link' : null;
}

/**
 * Every check that can refuse, before anything is dispatched (spec §6.1, §6.2, §8.3 live-ref path), in order:
 * route (keys, consent, provider allowlist) and origin, so `not_set_up` never comes after the click; the name the
 * live ref shows; the risk read without a snapshot (names, path `""`, raisers, `--risk`); the outcome route's
 * action policy, which refuses money, irreversible, auth and consent.
 */
export async function checkBeforeAct(
  ctx: CommandContext, page: PageRef, args: OutcomeWrapArgs, tab: TabInfo,
): Promise<Checked> {
  const route = await ctx.routeCheck(outcomeSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
  if (!route.ok) {
    const verdict = { kind: 'abstain' as const, cause: route.cause, detail: route.detail, leaned: null, confidence: null, threshold: null };
    return { refusal: abstainOutcome<OutcomeResult>(verdict, null) };
  }

  const { action, ref } = args.act;
  const [live, role] = await Promise.all([readLiveName(ctx.browser, page, ref), pageRole(ctx.browser, page, ref)]);
  const named = nameCheck(live.seen, args.expectName);
  if (named !== 'ok') {
    ctx.trace.untrusted.add('why.detail');
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    return refused('stale', 'expect_name_mismatch', `@${ref} shows ${shown}, not ${JSON.stringify(args.expectName)}; nothing was done`,
      { do: 'snapshot', argv: ['refsure', 'snap'] });
  }

  const lexical = classifyNames(live.sources, { url: tab.url, action, role, ...(args.risk ? { userRisk: args.risk } : {}) });
  const raised = CLICKS.has(action) ? await pageRaisers(ctx.browser, page, action) : await fieldRaisers(ctx.browser, page, ref);
  const risk: RiskReading = { class: maxRisk(lexical.class, raised.class), reasons: [...lexical.reasons, ...raised.reasons] };
  if (actionPolicy(action, risk.class, 'outcome') !== 'allow') {
    return refused('refused', 'high_risk_class',
      `${risk.class} (${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or consent; nothing was done`,
      { do: 'needs_human' });
  }
  return { cleared: { acted: `${role ?? actionRole(action)} ${JSON.stringify(cutName(norm(live.seen)))}`, risk } };
}
