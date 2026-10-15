import type { ApprovedRequest } from '../../egress';
import type { DecisionAnswer, DecisionQuestion } from '../../questions';
import type { Rendering } from '../rendering';
import type { Wire, WireReading } from '../wire';
import type { OpenAIBody, OpenAIQuestion } from './openai-body';
import { renderInput } from './render-input';

/*
  OpenAI's `/v1/decisions` request and response, ported from the author's
  earlier decision code (the `o_primary` and `o_s2` arms). A Choice stays a
  choice over the criteria in their own order; a Noul becomes a predicate whose
  probability is read back as the Noul. Answers are matched by name first, by
  position when unnamed, and all or nothing: one refusal makes the response a
  `refusal`, else one bad answer makes it `invalid`.
*/

function openaiQuestion(name: string, question: DecisionQuestion): OpenAIQuestion {
  if (question.type === 'choice') {
    return {
      type: 'choice',
      name,
      instructions: question.instructions,
      choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description })),
    };
  }
  const means = question.criteria
    ? `\n\nTrue means: ${question.criteria.true}\nFalse means: ${question.criteria.false}`
    : '';
  return { type: 'predicate', name, instructions: `${question.instructions}${means}` };
}

function openaiBody(model: string, req: ApprovedRequest, rendering: Rendering = 'o_primary'): OpenAIBody {
  return {
    model,
    input: renderInput(req.state, rendering),
    questions: Object.entries(req.questions).map(([name, question]) => openaiQuestion(name, question)),
  };
}

/** `{value: p}` or `[{value, probability}]` → `{value: p}`, unit numbers only; `null` when neither shape. */
function probabilityMap(raw: unknown): Record<string, number> | null {
  if (Array.isArray(raw)) {
    const map: Record<string, number> = {};
    for (const entry of raw) {
      if (!isRecord(entry)) return null;
      const value = entry.value ?? entry.choice ?? entry.label;
      const probability = entry.probability ?? entry.p;
      if (typeof value !== 'string' || !isUnit(probability)) return null;
      map[value] = probability;
    }
    return map;
  }
  if (isRecord(raw)) {
    const map: Record<string, number> = {};
    for (const [value, probability] of Object.entries(raw)) {
      if (!isUnit(probability)) return null;
      map[value] = probability;
    }
    return map;
  }
  return null;
}

type OneAnswer = { ok: true; answer: DecisionAnswer } | { ok: false; status: 'refusal' | 'invalid'; why: string };

/** One OpenAI answer → the Jev shape of the question asked. `why` never quotes the response. */
function mapOpenAIAnswer(name: string, question: DecisionQuestion, raw: unknown): OneAnswer {
  if (!isRecord(raw)) return { ok: false, status: 'invalid', why: `${name}: no answer` };
  if (raw.type === 'refusal') return { ok: false, status: 'refusal', why: `${name}: refused` };
  if (question.type === 'noul') {
    if (raw.type !== 'predicate' || !isUnit(raw.probability)) {
      return { ok: false, status: 'invalid', why: `${name}: not a predicate probability` };
    }
    return { ok: true, answer: { type: 'noul', noul: raw.probability } };
  }
  const offered = Object.keys(question.criteria);
  if (raw.type !== 'choice' || typeof raw.choice !== 'string') {
    return { ok: false, status: 'invalid', why: `${name}: not a choice answer` };
  }
  if (!offered.includes(raw.choice)) return { ok: false, status: 'invalid', why: `${name}: chose a value not offered` };
  if (!isUnit(raw.confidence)) return { ok: false, status: 'invalid', why: `${name}: no confidence` };
  const probabilities = probabilityMap(raw.probabilities);
  // Kept to the offered values: nothing the response adds travels further.
  const kept: Record<string, number> = {};
  for (const value of offered) {
    const probability = probabilities?.[value];
    if (probability !== undefined) kept[value] = probability;
  }
  return { ok: true, answer: { type: 'choice', choice: raw.choice, probabilities: kept, confidence: raw.confidence } };
}

function readOpenAI(json: unknown, questions: Readonly<Record<string, DecisionQuestion>>): WireReading {
  if (!isRecord(json)) return { status: 'invalid', answers: null, model: null, usd: null, detail: 'the body is not an object' };
  // No published price for this route: the cost is unknown, not zero.
  const model = typeof json.model === 'string' ? json.model : null;
  const list = answerList(json.answers);
  if (list === null) return { status: 'invalid', answers: null, model, usd: null, detail: 'the body has no answers' };
  if (answersUnasked(list, questions)) {
    return { status: 'invalid', answers: null, model, usd: null, detail: 'it answers a question that was not asked' };
  }
  const answers: Record<string, DecisionAnswer> = {};
  const problems: { status: 'refusal' | 'invalid'; why: string }[] = [];
  Object.entries(questions).forEach(([name, question], position) => {
    const mapped = mapOpenAIAnswer(name, question, answerFor(list, name, position));
    if (mapped.ok) answers[name] = mapped.answer;
    else problems.push({ status: mapped.status, why: mapped.why });
  });
  if (problems.length > 0) {
    const status = problems.some((problem) => problem.status === 'refusal') ? 'refusal' : 'invalid';
    return { status, answers: null, model, usd: null, detail: problems.map((problem) => problem.why).join('; ') };
  }
  return { status: 'ok', answers, model, usd: null };
}

export const OPENAI_WIRE: Wire = Object.freeze({
  id: 'openai',
  kinds: Object.freeze(['choice', 'noul'] as const),
  refusal: true,
  body: (model: string, req: ApprovedRequest, rendering?: Rendering) => openaiBody(model, req, rendering),
  read: readOpenAI,
});

/** A body's `answers`: an array as sent, or a record keyed by question name; `null` when neither. */
function answerList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) return Object.entries(raw).map(([name, answer]) => (isRecord(answer) ? { ...answer, name } : answer));
  return null;
}

/** More answers than questions, or one named for a question that was not asked: all or nothing, like Jev's. */
function answersUnasked(list: readonly unknown[], questions: Readonly<Record<string, DecisionQuestion>>): boolean {
  if (list.length > Object.keys(questions).length) return true;
  return list.some((answer) => isRecord(answer) && answer.name !== undefined
    && !(typeof answer.name === 'string' && Object.hasOwn(questions, answer.name)));
}

/** The answer to the question asked at `position` as `name`: by name first, by position when it carries no name. */
function answerFor(list: unknown[], name: string, position: number): unknown {
  const named = list.find((answer) => isRecord(answer) && answer.name === name);
  const positional = list[position];
  return named ?? (isRecord(positional) && positional.name === undefined ? positional : undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
