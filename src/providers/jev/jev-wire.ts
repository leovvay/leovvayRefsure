import type { ApprovedRequest } from '../../egress';
import { validateAnswers, type DecisionQuestion } from '../../questions';
import type { Wire, WireReading } from '../wire';
import type { JevBody } from './jev-body';

/*
  Jev's `systemone` request and response, ported from the author's earlier
  decision code: a response is used only when it carries a model, an answers
  record and a usage record, and its answers pass `validateAnswers` all or
  nothing. What comes back is rebuilt from the fields read, so nothing a
  response adds travels further.
*/

function jevBody(model: string, req: ApprovedRequest): JevBody {
  // Zero data retention, and no training on it: a request preference refsure cannot verify (spec §7.3).
  return { model, state: req.state, questions: req.questions, provider: { zdr: true, data_collection: 'deny' } };
}

function readJev(json: unknown, questions: Readonly<Record<string, DecisionQuestion>>): WireReading {
  if (!isRecord(json)) return { status: 'invalid', answers: null, model: null, usd: null, detail: 'the body is not an object' };
  const model = typeof json.model === 'string' ? json.model : null;
  const usd = isRecord(json.usage) ? costOf(json.usage.cost) : null;
  if (model === null || !isRecord(json.answers) || !isRecord(json.usage)) {
    return { status: 'invalid', answers: null, model, usd, detail: 'the body lacks a model, answers or usage' };
  }
  const answers = validateAnswers(questions, json.answers);
  if (!answers) return { status: 'invalid', answers: null, model, usd, detail: 'an answer does not fit its question' };
  return { status: 'ok', answers, model, usd };
}

export const JEV_WIRE: Wire = Object.freeze({
  id: 'jev',
  kinds: Object.freeze(['choice', 'noul'] as const),
  refusal: false,
  body: (model: string, req: ApprovedRequest) => jevBody(model, req),
  read: readJev,
});

function costOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
