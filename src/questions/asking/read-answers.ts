import type { PartOutcome } from '../../providers';
import { maturityOf, snapshotChanged } from '../calibration';
import type { MaturityReading } from '../calibration';
import type { DecisionSite } from '../decision-site';
import type { Maturity } from '../site-id';
import type { Verdict } from '../verdict';
import type { AnswerReading } from './answer-reading';
import { answeringModel, UNNAMED_MODEL } from './answering-model';

const RANK: Readonly<Record<Maturity, number>> = { experimental: 0, inherited: 1, measured: 2 };

/** An answer that names no model is from a family no release measured (spec §8.6): authority `none`. */
const UNNAMED: MaturityReading = { maturity: 'experimental', newFamily: true };

/**
 * The parts whose model counts: on an answer, the parts that answered it (both for `agree`, the answering one for
 * `fallback`); on an abstain, every part a model replied to. A complete answer counts whether or not it named its
 * model.
 */
function counted<Out>(parts: readonly PartOutcome<Out>[], verdict: Verdict<Out>): PartOutcome<Out>[] {
  const replied = parts.filter((part) => answeringModel(part) !== null);
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
    const model = answeringModel(part) as string;
    const one = model === UNNAMED_MODEL ? UNNAMED : maturityOf(site, part.provider, model, wordingHash);
    reading.maturity = first || RANK[one.maturity] < RANK[reading.maturity] ? one.maturity : reading.maturity;
    first = false;
    reading.newFamily ||= one.newFamily;
    reading.modelChanged ||= !one.newFamily && snapshotChanged(part.provider, part.model, model);
    reading.models.push(model);
  }
  return reading;
}
