import type { PageRef, Ref, TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { actionPolicy, liveRefRisk, nameCheck, readLiveTarget } from '../../risk';
import { highRiskNext, nothingDone, sleep } from '../shared';
import type { PickOptionResult } from './pick-option.contract';

/** How long a dropdown gets to render its options after the click. */
const OPEN_SETTLE_MS = 400;
const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

/**
 * `--open` (spec §6.3, §8.3 live-ref path): click the field itself, with no snapshot taken first. The live ref must
 * still show `expectName`, else `stale` / `expect_name_mismatch`: a ref renumbered by any snapshot since may now
 * name another control. Opening a list only shows it, so the click passes at any class below high risk; the
 * lexicon and the raisers still read every name the field shows, and money, irreversible, auth or consent refuse
 * before the click. `null`: it was clicked.
 */
export async function openField(
  ctx: CommandContext, page: PageRef, tab: TabInfo, field: Ref, opts: { want: string; expectName: string },
): Promise<CommandOutcome<PickOptionResult> | null> {
  const { want, expectName } = opts;
  const target = await readLiveTarget(ctx.browser, page, field, 'click');
  const named = nameCheck(target.live, expectName);
  if (named !== 'ok') {
    ctx.trace.untrusted.add('why.detail');
    const shown = named.mismatch === '' ? 'no name' : JSON.stringify(named.mismatch);
    return nothingDone('stale', 'expect_name_mismatch',
      `@${field} shows ${shown}, not ${JSON.stringify(expectName)}; nothing was clicked`, { next: SNAPSHOT });
  }
  const risk = await liveRefRisk(ctx.browser, page, field, 'click', target, { url: tab.url });
  if (actionPolicy('click', risk.class, 'pick-option') !== 'allow') {
    ctx.trace.untrusted.add('next.argv');
    const next = highRiskNext({
      class: risk.class, via: { ref: field, expectName: target.live.seen }, action: 'click', intent: `open the field to pick "${want}"`,
    });
    return nothingDone('refused', 'high_risk_class',
      `opening @${field} reads ${risk.class} (${risk.reasons.join(', ')}): pick-option never clicks it; nothing was done`, { next });
  }
  const sent = await ctx.browser.act(page, field, 'click');
  if (sent.kind === 'stale_ref') {
    return nothingDone('stale', 'ref_gone', `@${field} is gone from the page; nothing was clicked`, { next: SNAPSHOT });
  }
  if (sent.kind === 'unknown') {
    return {
      status: 'effect_unknown', acted: true, effect: 'unknown', result: null,
      why: { cause: 'effect_unknown', detail: sent.detail }, next: SNAPSHOT,
    };
  }
  await sleep(OPEN_SETTLE_MS, ctx.signal);
  return null;
}
