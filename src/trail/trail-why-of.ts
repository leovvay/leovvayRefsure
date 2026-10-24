import type { DecisionInfo, TrailWhy } from '../output';
import { boundUnit, boundWord } from './trail-bound';
import type { TrailRow } from './trail-spec';

type RowWhy = NonNullable<TrailRow['why']>;

/** A why as a row carries it: words bounded, numbers in 0..1, absent fields left out. */
export function boundWhy(why: TrailWhy): RowWhy {
  const out: RowWhy = { by: why.by };
  const site = boundWord(why.site);
  const model = boundWord(why.model);
  const p = boundUnit(why.p);
  const threshold = boundUnit(why.threshold);
  if (site !== undefined) out.site = site;
  if (model !== undefined) out.model = model;
  if (p !== undefined) out.p = p;
  if (threshold !== undefined) out.threshold = threshold;
  return out;
}

/** A Decision as the reason: its site, model, confidence and the threshold its verdict was read at. */
export function whyOfDecision(info: DecisionInfo): TrailWhy {
  const why: TrailWhy = { by: 'decision', site: info.site, model: info.model };
  if (info.confidence !== null) why.p = info.confidence;
  if (info.threshold !== null) why.threshold = info.threshold;
  return why;
}

/**
 * A step's why: the feature's own (`RunTrace.trailWhy`: a ticket's pick, `run`'s step held to its risk row), else
 * the last Decision asked since the previous row (exact for `dismiss`, whose Decision comes right before its
 * click), else `fallback` (`agent` for an act on the agent's own ref, none for a read).
 */
export function whyOf(
  own: TrailWhy | undefined, since: readonly DecisionInfo[], fallback: TrailWhy | null,
): RowWhy | undefined {
  const last = since.at(-1);
  const why = own ?? (last === undefined ? fallback : whyOfDecision(last));
  return why === null ? undefined : boundWhy(why);
}

/**
 * Model time in a step: the Decisions asked since the previous row, summed, but never more than the wall time the
 * step spent outside its snapshots. `do` asks its Decisions in parallel, all before its first act; a plain sum
 * would count that wait once per Decision.
 */
export function decideMs(since: readonly DecisionInfo[], wallMs: number): number | undefined {
  if (since.length === 0) return undefined;
  const sum = since.reduce((total, info) => total + (Number.isFinite(info.ms) ? info.ms : 0), 0);
  return Math.min(sum, Math.max(0, wallMs));
}
