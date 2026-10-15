import type { PartOutcome } from '../../providers';
import { bareModel, maturityOf, snapshotChanged } from '../calibration';
import type { DecisionSite } from '../decision-site';
import type { Maturity } from '../site-id';
import type { Verdict } from '../verdict';
import type { AnswerReading } from './answer-reading';

const RANK: Readonly<Record<Maturity, number>> = { experimental: 0, inherited: 1, measured: 2 };

/**
 * The parts whose model counts: on an answer, the parts that answered it (both for `agree`, the answering one for
 * `fallback`); on an abstain, every part a model replied to.
 */
function counted<Out>(parts: readonly PartOutcome<Out>[], verdict: Verdict<Out>): PartOutcome<Out>[] {
  const replied = parts.filter((part) => part.answer.model !== null);
  if (verdict.kind !== 'answer') return replied;
  return replied.filter((part) => part.verdict.kind === 'answer');
}

/**
 * Maturity from the family of each returned model (spec §8.6), the least mature part winning. With no model to
 * read (nothing answered), the site's declared maturity for this input stands.
 */
export function readAnswers<In, Ctx, Out>(
  site: DecisionSite<In, Ctx, Out>,
  wordingHash: string,
  declared: Maturity,
  parts: readonly PartOutcome<Out>[],
  verdict: Verdict<Out>,
): AnswerReading {
  const reading: AnswerReading = { maturity: declared, newFamily: false, modelChanged: false, models: [] };
  let first = true;
  for (const part of counted(parts, verdict)) {
    const model = part.answer.model as string;
    const one = maturityOf(site, part.provider, model, wordingHash);
    reading.maturity = first || RANK[one.maturity] < RANK[reading.maturity] ? one.maturity : reading.maturity;
    first = false;
    reading.newFamily ||= one.newFamily;
    reading.modelChanged ||= !one.newFamily && snapshotChanged(part.provider, part.model, model);
    reading.models.push(bareModel(model));
  }
  return reading;
}
