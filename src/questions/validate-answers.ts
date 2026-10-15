import { isRecord, isUnit } from '../shared';
import type {
  DecisionAnswer,
  DecisionChoiceAnswer,
  DecisionChoiceQuestion,
  DecisionNoulAnswer,
  DecisionQuestion,
  NoulBand,
} from './wire-types';

/*
  An answer is used only if it is an answer to the question that was asked.
  Ported from the author's earlier decision code, choice and noul only.

  All or nothing: one malformed answer makes the whole response invalid. A
  response that got one question's shape wrong is not evidence the others are
  right, and a partially trusted response is a branch every caller would have
  to get right.

  What is returned is rebuilt from the fields read here, never the parsed
  object itself, so nothing a response adds travels any further than this file.
*/

/** Every expected key present with a probability; keys the question did not name are dropped. */
function probabilitiesFor(value: unknown, keys: string[]): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const probabilities: Record<string, number> = {};
  for (const key of keys) {
    const probability = value[key];
    if (!isUnit(probability)) return null;
    probabilities[key] = probability;
  }
  return probabilities;
}

function choiceAnswer(question: DecisionChoiceQuestion, raw: Record<string, unknown>): DecisionChoiceAnswer | null {
  const keys = Object.keys(question.criteria);
  if (typeof raw.choice !== 'string' || !keys.includes(raw.choice) || !isUnit(raw.confidence)) return null;
  const probabilities = probabilitiesFor(raw.probabilities, keys);
  if (!probabilities) return null;
  return { type: 'choice', choice: raw.choice, probabilities, confidence: raw.confidence };
}

function noulAnswer(raw: Record<string, unknown>): DecisionNoulAnswer | null {
  return isUnit(raw.noul) ? { type: 'noul', noul: raw.noul } : null;
}

/**
 * Every question answered with its own type and in range, and nothing else answered, or `null`. An answer to a
 * question that was not asked is not one of the options code offered (spec §8.1 rule 1): the reply is invalid.
 */
export function validateAnswers(
  questions: Readonly<Record<string, DecisionQuestion>>,
  answers: unknown,
): Record<string, DecisionAnswer> | null {
  if (!isRecord(answers)) return null;
  if (Object.keys(answers).some((name) => !Object.hasOwn(questions, name))) return null;
  const valid: Record<string, DecisionAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const raw = answers[name];
    if (!isRecord(raw) || raw.type !== question.type) return null;
    const answer = question.type === 'choice' ? choiceAnswer(question, raw) : noulAnswer(raw);
    if (!answer) return null;
    valid[name] = answer;
  }
  return valid;
}

/** A band edge to six places: far finer than the model's hundredths, coarse enough to drop float noise. */
function roundBand(edge: number): number {
  return Math.round(edge * 1e6) / 1e6;
}

/** `yes` at or above the band's top edge, `no` at or below its bottom edge, `abstain` inside the band. */
export function noulVerdict(noul: number, band: NoulBand): 'yes' | 'no' | 'abstain' {
  // Rounded, because answers come in hundredths and binary floats do not: a
  // bare threshold of 0.9 reads as a band whose bottom edge is 1 - 0.9, which is
  // 0.09999999999999998, and would turn an answer of exactly 0.10, a confident
  // "no" by the band's own definition, into an abstain.
  if (noul >= roundBand(band.yesAtLeast)) return 'yes';
  if (noul <= roundBand(band.noAtMost)) return 'no';
  return 'abstain';
}
