import { type PageRef, type Ref, type TabInfo, VALUE_ACTIONS } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { NEEDS_HUMAN, RE_OBSERVE } from '../../output';
import { cutName, describeElement, norm } from '../../page-model';
import { outcomeSite } from '../../questions';
import { actionRole, classifyNames, liveRefRisk, nameCheck, readLiveTarget, refusesHighRisk } from '../../risk';
import type { LiveName, RiskReading } from '../../risk';
import { abstainOutcome, highRiskNext, nothingDone } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';

/**
 * What the guard learned: `acted` for the Decision's `acted_element` (e.g. `button "Save"`); the names the live ref
 * showed, its explicit role and the URL its risk was read on, for `nameStill`. The body text it read fed only the
 * confirm-dialog raiser; the outcome's before-side is read after every check (spec §6.2).
 */
type Cleared = { acted: string; live: LiveName; role: string | null; url: string };

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
  if (named !== 'ok') return { refusal: nameMismatch(ctx, ref, 'shows', named.mismatch, args.expectName) };

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
  return { cleared: { acted: describeElement(role ?? actionRole(action), live.seen), live, role, url: tab.url } };
}

/** `expect_name_mismatch`: the live ref shows another name than `--expect-name` (page text, so untrusted). */
function nameMismatch(
  ctx: CommandContext, ref: Ref, verb: string, seen: string, expectName: string,
): CommandOutcome<OutcomeResult> {
  ctx.trace.untrusted.add('why.detail');
  const shown = seen === '' ? 'no name' : JSON.stringify(seen);
  const detail = `@${ref} ${verb} ${shown}, not ${JSON.stringify(expectName)}; nothing was done`;
  return nothingDone('stale', 'expect_name_mismatch', detail, { next: RE_OBSERVE });
}

/**
 * The before-read runs after the guard (spec §6.2), so the ref gets one more look before the dispatch: its text,
 * read again in one call. Unchanged, the guard's names and risk stand. Changed, those names with the new text in
 * place of the old must still show `--expect-name`, and every name, the new text included, is read for risk again
 * (spec §8.1 rules 4-5: risk only rises): a rename to "Save and send" refuses as the guard would, with no command
 * offered, since the page renamed it while the act was checked. A fill's or select's text is no name, so its names
 * stand. Null: go on.
 */
export async function nameStill(
  ctx: CommandContext, page: PageRef, args: OutcomeWrapArgs, cleared: Cleared,
): Promise<CommandOutcome<OutcomeResult> | null> {
  const { action, ref } = args.act;
  if (VALUE_ACTIONS.has(action)) return null;
  const text = norm(await ctx.browser.text(page, ref));
  const { live } = cleared;
  if (text === live.text) return null;
  const names = [...live.names.filter((name) => norm(name) !== live.text), text];
  const named = nameCheck({ seen: text, names }, args.expectName);
  if (named !== 'ok') return nameMismatch(ctx, ref, 'now shows', named.mismatch, args.expectName);
  const risk = classifyNames([...live.sources, text], {
    url: cleared.url, action, role: cleared.role, ...(args.risk ? { userRisk: args.risk } : {}),
  });
  if (!refusesHighRisk(risk.class)) return null;
  ctx.trace.untrusted.add('why.detail');
  const detail = `@${ref} now shows ${JSON.stringify(cutName(text))}, which reads ${risk.class} `
    + `(${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or consent, and the page renamed `
    + 'it while the act was checked, so no command is offered for it; nothing was done. A human decides';
  return nothingDone('refused', 'high_risk_class', detail, { next: NEEDS_HUMAN });
}
