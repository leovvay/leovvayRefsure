import { abstainVerdict, quoteOption, type Verdict } from '../../questions';
import { askOne } from './ask-one';
import type { ComboOutcome, PartOutcome } from './combo-outcome';
import type { AskOptions, ComboPart } from './combo-part';
import { firstAbstain, lowest } from './rank';
import type { Answer } from './verdict-kinds';

/**
 * Ask every part in parallel, each with its own deadline. It passes only when every part answers the same
 * presented index (on a Noul site, every part says yes within its own band). A part's abstain is the
 * verdict, an unavailable one first; differing answers are `disagree`, leaning to Jev's index and value. The
 * reported confidence is the lowest, with that part's threshold.
 */
export async function askAgree<Out>(parts: readonly ComboPart<Out>[], opts: AskOptions): Promise<ComboOutcome<Out>> {
  const outcomes = await Promise.all(parts.map((part) => askOne(part, opts)));
  return { verdict: agreeVerdict(outcomes, parts), parts: outcomes };
}

/** What a part chose, as a refusal names it: the option's text as that part sent it, never its shuffled key. */
function chosen<Out>(part: ComboPart<Out> | undefined, answer: Answer<Out> | undefined): string {
  const index = answer?.index ?? null;
  const asked = part?.request.questions[part.question];
  const text = index !== null && asked?.type === 'choice' ? asked.criteria[index] : undefined;
  return text === undefined ? (index ?? String(answer?.value)) : quoteOption(text);
}

function agreeVerdict<Out>(outcomes: readonly PartOutcome<Out>[], parts: readonly ComboPart<Out>[]): Verdict<Out> {
  const abstain = firstAbstain(outcomes);
  if (abstain) return abstain;
  const answers = outcomes.map((outcome) => outcome.verdict as Answer<Out>);
  const leadAt = Math.max(0, outcomes.findIndex((outcome) => outcome.provider === 'jev'));
  const lead = answers[leadAt];
  const low = lowest(answers);
  if (!lead || !low) {
    return abstainVerdict('provider_error', 'no provider was asked');
  }
  if (answers.every((answer) => sameChoice(answer, lead))) {
    return { kind: 'answer', value: lead.value, index: lead.index, confidence: low.confidence, threshold: low.threshold };
  }
  const chose = outcomes.map((outcome, at) => `${outcome.provider} chose ${chosen(parts[at], answers[at])}`);
  return {
    kind: 'abstain',
    cause: 'disagree',
    detail: chose.join(', '),
    leaned: lead.index,
    leanedValue: lead.value,
    confidence: low.confidence,
    threshold: low.threshold,
  };
}

function sameChoice<Out>(a: Answer<Out>, b: Answer<Out>): boolean {
  if (a.index !== null || b.index !== null) return a.index === b.index;
  return Object.is(a.value, b.value);
}
