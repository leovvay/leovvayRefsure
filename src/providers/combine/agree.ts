import type { Verdict } from '../../questions';
import { askOne } from './ask-one';
import type { ComboOutcome, PartOutcome } from './combo-outcome';
import type { AskOptions, ComboPart } from './combo-part';
import { firstAbstain, lowest } from './rank';
import type { Answer } from './verdict-kinds';

/**
 * Ask every part in parallel, each with its own deadline. It passes only when every part answers the same
 * presented index (on a Noul site, every part says yes within its own band). A part's abstain is the
 * verdict, an unavailable one first; differing answers are `disagree`, leaning to Jev's index. The
 * reported confidence is the lowest, with that part's threshold.
 */
export async function askAgree<Out>(parts: readonly ComboPart<Out>[], opts: AskOptions): Promise<ComboOutcome<Out>> {
  const outcomes = await Promise.all(parts.map((part) => askOne(part, opts)));
  return { verdict: agreeVerdict(outcomes), parts: outcomes };
}

export function agreeVerdict<Out>(outcomes: readonly PartOutcome<Out>[]): Verdict<Out> {
  const abstain = firstAbstain(outcomes);
  if (abstain) return abstain;
  const answers = outcomes.map((outcome) => outcome.verdict as Answer<Out>);
  const leadAt = Math.max(0, outcomes.findIndex((outcome) => outcome.provider === 'jev'));
  const lead = answers[leadAt];
  const low = lowest(answers);
  if (!lead || !low) {
    return { kind: 'abstain', cause: 'provider_error', detail: 'no provider was asked', leaned: null, confidence: null, threshold: null };
  }
  if (answers.every((answer) => sameChoice(answer, lead))) {
    return { kind: 'answer', value: lead.value, index: lead.index, confidence: low.confidence, threshold: low.threshold };
  }
  const chose = outcomes.map((outcome, at) => `${outcome.provider} chose ${answers[at]?.index ?? String(answers[at]?.value)}`);
  return {
    kind: 'abstain',
    cause: 'disagree',
    detail: chose.join(', '),
    leaned: lead.index,
    confidence: low.confidence,
    threshold: low.threshold,
  };
}

function sameChoice<Out>(a: Answer<Out>, b: Answer<Out>): boolean {
  if (a.index !== null || b.index !== null) return a.index === b.index;
  return Object.is(a.value, b.value);
}
