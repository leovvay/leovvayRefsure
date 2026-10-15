import type { DecisionInfo, DecisionPart } from '../../output';
import type { PartOutcome } from '../../providers';
import type { ProviderChoice, SiteId } from '../site-id';
import type { Verdict } from '../verdict';
import type { AnswerReading } from './answer-reading';

function partOf<Out>(part: PartOutcome<Out>): DecisionPart {
  const verdict = part.verdict;
  return {
    provider: part.provider,
    model: part.answer.model ?? part.model,
    index: verdict.kind === 'answer' ? verdict.index : verdict.leaned,
    confidence: verdict.confidence,
    threshold: verdict.threshold,
    ms: part.answer.ms,
    usd: part.answer.usd,
  };
}

/** Every reported cost summed; `null` when no part reported one (unknown, not zero). */
function usdOf(parts: readonly DecisionPart[]): number | null {
  const known = parts.flatMap((part) => (part.usd === null ? [] : [part.usd]));
  return known.length === 0 ? null : Math.round(known.reduce((sum, usd) => sum + usd, 0) * 1e6) / 1e6;
}

/**
 * The envelope's `decision` (spec §6.1): the combined verdict's confidence and threshold (the lower part for
 * `agree`, the answering part for `fallback`), every part asked in order, and the whole asking time.
 */
export function decisionInfo<Out>(input: {
  site: SiteId;
  wording: { version: number; hash: string };
  provider: ProviderChoice;
  verdict: Verdict<Out>;
  parts: readonly PartOutcome<Out>[];
  reading: AnswerReading;
  ms: number;
}): DecisionInfo {
  const parts = input.parts.map(partOf);
  const requested = [...new Set(parts.map((part) => part.model))];
  const info: DecisionInfo = {
    site: input.site,
    wording: { version: input.wording.version, hash: input.wording.hash },
    provider: input.provider,
    model: (input.reading.models.length > 0 ? input.reading.models : requested).join('+'),
    maturity: input.reading.maturity,
    confidence: input.verdict.confidence,
    threshold: input.verdict.threshold,
    ms: input.ms,
    usd: usdOf(parts),
    parts,
  };
  if (input.reading.modelChanged) info.model_changed = true;
  return info;
}
