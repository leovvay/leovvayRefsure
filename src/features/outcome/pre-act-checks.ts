import { FIELD_ACTIONS, type PageRef, type Ref, type TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import { NEEDS_HUMAN, RE_OBSERVE } from '../../output';
import { cutName, norm } from '../../page-model';
import { outcomeSite } from '../../questions';
import {
  classifyNames, fieldRaisers, liveRefRisk, mergeReadings, nameCheck, readLiveName, readLiveTarget, refusesHighRisk,
} from '../../risk';
import type { LiveName, RiskReading } from '../../risk';
import { abstainOutcome, highRiskNext, nothingDone } from '../shared';
import type { OutcomeWrapArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';

/**
 * What the guard learned, for `nameStill`: the names the live ref showed, its explicit role and the URL its risk was
 * read on. The role also names it in the Decision's `acted_element`. The body text it read fed only the
 * confirm-dialog raiser; the outcome's before-side is read after every check (spec §6.2).
 */
type Cleared = { live: LiveName; role: string | null; url: string };

type Checked = { refusal: CommandOutcome<OutcomeResult> } | { cleared: Cleared };

/** The ref after the before-read: the names it shows at the dispatch, or why nothing is done. */
type Still = { refusal: CommandOutcome<OutcomeResult> } | { live: LiveName };

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
    // The caller's own ref and intent, with the full name the ref shows now, which `--expect-name` may only be part
    // of ("Save" in "Save and send"): the one command that may take it, spelled out (spec §6.3). Page text in both.
    ctx.trace.untrusted.add('next.argv');
    ctx.trace.untrusted.add('why.detail');
    const next = highRiskNext({
      class: risk.class, via: { ref, expectName: live.seen }, action, intent: args.intent,
      ...(args.act.value === undefined ? {} : { value: args.act.value }),
      ...(args.risk ? { risk: args.risk } : {}),
    });
    const detail = `@${ref} shows ${JSON.stringify(cutName(norm(live.seen)))}, which reads ${risk.class} `
      + `(${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or consent; nothing was done. `
      + 'Only act-high-risk takes it, and only when the human asked for exactly this';
    return { refusal: nothingDone('refused', 'high_risk_class', detail, { next }) };
  }
  return { cleared: { live, role, url: tab.url } };
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

/** Whether the ref reads as the guard read it: the same name sources, in order, and the same field attributes. */
function unchanged(was: LiveName, now: LiveName): boolean {
  return JSON.stringify([was.sources, was.fieldAttrs]) === JSON.stringify([now.sources, now.fieldAttrs]);
}

/**
 * The before-read runs after the guard (spec §6.2), so the ref gets one more look before the dispatch: every name
 * source the guard read (its text, `aria-label`, `placeholder`, `title`, the labels elsewhere that name it, an
 * `<input>` button's `value`) and a field's attributes, read again the same way. An icon button, whose text is a
 * glyph or nothing, is read by its label like any other. Unchanged, the guard's names and risk stand. Changed, the
 * new names must still show `--expect-name`, and every name, old and new, is read for risk again, a field's raisers
 * on its new attributes too (spec §8.1 rules 4-5: risk only rises): a rename to "Save and send" refuses as the guard
 * would, with no command offered, since the page renamed it while the act was checked. The page raisers and the
 * confirm-dialog raiser are not read again.
 */
export async function nameStill(
  ctx: CommandContext, page: PageRef, args: OutcomeWrapArgs, cleared: Cleared,
): Promise<Still> {
  const { action, ref } = args.act;
  const live = await readLiveName(ctx.browser, page, ref, action);
  if (unchanged(cleared.live, live)) return { live: cleared.live };
  const named = nameCheck(live, args.expectName);
  if (named !== 'ok') return { refusal: nameMismatch(ctx, ref, 'now shows', named.mismatch, args.expectName) };
  const lexical = classifyNames([...new Set([...cleared.live.sources, ...live.sources])], {
    url: cleared.url, action, role: cleared.role, ...(args.risk ? { userRisk: args.risk } : {}),
  });
  const risk = FIELD_ACTIONS.has(action)
    ? mergeReadings(lexical, await fieldRaisers(ctx.browser, page, ref, live.fieldAttrs))
    : lexical;
  if (!refusesHighRisk(risk.class)) return { live };
  ctx.trace.untrusted.add('why.detail');
  const detail = `@${ref} now shows ${JSON.stringify(cutName(norm(live.seen)))}, which reads ${risk.class} `
    + `(${risk.reasons.join(', ')}): outcome never acts on money, irreversible, auth or consent, and the page changed `
    + 'it while the act was checked, so no command is offered for it; nothing was done. A human decides';
  return { refusal: nothingDone('refused', 'high_risk_class', detail, { next: NEEDS_HUMAN }) };
}
