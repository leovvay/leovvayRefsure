import type { AbstainCause } from '../../questions';
import { askOne, labelled } from './ask-one';
import type { ComboOutcome, PartOutcome } from './combo-outcome';
import type { AskOptions, ComboPart } from './combo-part';
import { firstAbstain } from './rank';
import type { Abstain } from './verdict-kinds';

/** Jev's abstains that OpenAI may answer instead (spec §8.2 steps 4-8). */
const FALLBACK_ON: ReadonlySet<AbstainCause> = new Set<AbstainCause>([
  'provider_timeout', 'provider_error', 'low_confidence', 'none_chosen',
]);

/** Abstains that carry a reading of the page: the model answered, under its threshold or with `none`. */
const READ: ReadonlySet<AbstainCause> = new Set<AbstainCause>(['low_confidence', 'none_chosen']);

function withNote<Out>(verdict: Abstain<Out>, who: string, note: string): Abstain<Out> {
  return { ...verdict, detail: `${labelled(who, verdict.detail)}; ${note}` };
}

function abstainOf<Out>(part: PartOutcome<Out>): Abstain<Out> | null {
  return part.verdict.kind === 'abstain' ? part.verdict : null;
}

function readThePage<Out>(part: PartOutcome<Out>): boolean {
  const verdict = abstainOf(part);
  return verdict !== null && READ.has(verdict.cause);
}

/**
 * Both parts abstained. Either one may answer a fallback alone, so an abstain that read the page (its lean and
 * missed threshold, which refusals quote: spec §8.1 rule 3) outranks a provider that could not answer. Otherwise
 * the §8.2 rank decides, and on a tie OpenAI's, the later word. The other part's outcome stays in the detail.
 */
function bothAbstained<Out>(jev: PartOutcome<Out>, openai: PartOutcome<Out>): Abstain<Out> | null {
  let chosen = openai;
  if (readThePage(jev) !== readThePage(openai)) chosen = readThePage(jev) ? jev : openai;
  else if (firstAbstain([openai, jev])?.cause !== abstainOf(openai)?.cause) chosen = jev;
  const other = chosen === openai ? jev : openai;
  const verdict = abstainOf(chosen);
  const otherDetail = abstainOf(other)?.detail;
  if (!verdict) return null;
  return otherDetail === undefined ? verdict : withNote(verdict, chosen.provider, labelled(other.provider, otherDetail));
}

/**
 * Ask Jev; ask OpenAI only when Jev could not answer or was not confident, and only when the caps, now counting
 * Jev's call, still admit a second one. The answering part's verdict and confidence are reported.
 */
export async function askFallback<Out>(jevPart: ComboPart<Out>, openaiPart: ComboPart<Out>, opts: AskOptions): Promise<ComboOutcome<Out>> {
  const jev = await askOne(jevPart, opts);
  if (jev.verdict.kind === 'answer' || !FALLBACK_ON.has(jev.verdict.cause) || opts.signal.aborted) {
    return { verdict: jev.verdict, parts: [jev] };
  }
  const refusal = openaiPart.admit?.() ?? null;
  if (refusal) {
    return { verdict: withNote(jev.verdict, jev.provider, `openai was not asked: ${refusal.detail}`), parts: [jev] };
  }
  const openai = await askOne(openaiPart, opts);
  if (openai.verdict.kind === 'answer') return { verdict: openai.verdict, parts: [jev, openai] };
  return { verdict: bothAbstained(jev, openai) ?? openai.verdict, parts: [jev, openai] };
}
