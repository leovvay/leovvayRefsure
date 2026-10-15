import type { AbstainCause } from '../../questions';
import { askOne } from './ask-one';
import type { ComboOutcome } from './combo-outcome';
import type { AskOptions, ComboPart } from './combo-part';
import { firstAbstain } from './rank';

/** Jev's abstains that OpenAI may answer instead (spec §8.2 steps 4-8). */
const FALLBACK_ON: ReadonlySet<AbstainCause> = new Set<AbstainCause>([
  'provider_timeout', 'provider_error', 'low_confidence', 'none_chosen',
]);

/**
 * Ask Jev; ask OpenAI only when Jev could not answer or was not confident. The answering part's verdict
 * and confidence are reported. When both abstain, an unavailable cause wins, and on a tie OpenAI's, the
 * later word.
 */
export async function askFallback<Out>(jevPart: ComboPart<Out>, openaiPart: ComboPart<Out>, opts: AskOptions): Promise<ComboOutcome<Out>> {
  const jev = await askOne(jevPart, opts);
  if (jev.verdict.kind === 'answer' || !FALLBACK_ON.has(jev.verdict.cause) || opts.signal.aborted) {
    return { verdict: jev.verdict, parts: [jev] };
  }
  const openai = await askOne(openaiPart, opts);
  if (openai.verdict.kind === 'answer') return { verdict: openai.verdict, parts: [jev, openai] };
  return { verdict: firstAbstain([openai, jev]) ?? openai.verdict, parts: [jev, openai] };
}
