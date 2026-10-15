import type { TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Candidate, exactNameMatch, rankCandidates, twinKey } from '../../page-model';
import { findSite, locateSite } from '../../questions';
import type { LocateArgs } from './locate.args';
import type { LocateTop } from './locate-top';
import type { Picked } from './picked';

/** A twin group's key: equal role, `norm`ed name and path (spec §8.3). */
export function keyOf(c: Candidate): string {
  return twinKey(c.fp.role, c.fp.name, c.fp.path);
}

/** The first match when every match is of one twin group; `null` when none, or when they differ. */
function oneGroup(matches: readonly Candidate[]): Candidate | null {
  const first = matches[0];
  if (first === undefined) return null;
  const key = keyOf(first);
  return matches.every((m) => keyOf(m) === key) ? first : null;
}

/** One candidate per twin group, the first in page order: identical lines tell a model nothing apart. */
function distinct(cands: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = keyOf(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Code first (spec §6.2): `--recorded` settles when exactly one twin group carries that very line; `--intent` when
 * one twin group's `fold`ed name equals the intent (or its quoted part). A group of twins still goes on to the
 * twin rule. `null` sends the question to a Decision.
 */
export function codePick(args: LocateArgs, cands: readonly Candidate[]): Picked | null {
  if (args.recorded !== null) {
    const cand = oneGroup(cands.filter((c) => c.line === args.recorded));
    return cand === null ? null : { kind: 'code', cand, site: 'locate' };
  }
  const cand = oneGroup(exactNameMatch(cands, args.intent ?? ''));
  return cand === null ? null : { kind: 'code', cand, site: 'find' };
}

function topOf(
  ranking: readonly { value: number; p: number }[] | undefined, lines: readonly string[], n: number | null,
): LocateTop[] | null {
  if (n === null || ranking === undefined) return null;
  return ranking.slice(0, n).map((r) => ({ line: lines[r.value] ?? '', p: Math.round(r.p * 1000) / 1000 }));
}

/**
 * The Decision (spec §6.2): up to 20 ranked candidate lines, one per twin group, shuffled by the site, plus
 * `none`. `--recorded` asks the `locate` site with the line verbatim; `--intent` alone asks `find`. Jev only; the
 * threshold row is `--risk`'s, else the strictest.
 */
export async function decidePick(
  args: LocateArgs, ctx: CommandContext, tab: TabInfo, cands: readonly Candidate[],
): Promise<Picked> {
  const shortlist = rankCandidates(distinct(cands), args.intent ?? args.recorded ?? '');
  const lines = shortlist.map((c) => c.line);
  const opts = {
    combo: 'auto' as const, originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal,
    ...(args.risk === undefined ? {} : { risk: args.risk }),
  };
  const site = args.recorded !== null ? 'locate' : 'find';
  const decided = args.recorded !== null
    ? await ctx.decide(locateSite, { recorded: args.recorded, intent: args.intent ?? '', lines }, opts)
    : await ctx.decide(findSite, { intent: args.intent ?? '', lines }, opts);
  const { verdict } = decided;
  const top = topOf(verdict.ranking, lines, args.top);
  if (verdict.kind === 'abstain') return { kind: 'abstain', verdict, top };
  const cand = shortlist[verdict.value];
  if (cand === undefined) {
    const detail = `answered option ${verdict.index ?? '?'}, which was not offered`;
    const failed = {
      kind: 'abstain' as const, cause: 'provider_error' as const, detail, leaned: null,
      confidence: verdict.confidence, threshold: verdict.threshold,
    };
    return { kind: 'abstain', verdict: failed, top };
  }
  return {
    kind: 'decision', cand, site, confidence: verdict.confidence, maturity: decided.maturity,
    newFamily: decided.newFamily, model: ctx.trace.decisions.at(-1)?.model ?? null, top,
  };
}
