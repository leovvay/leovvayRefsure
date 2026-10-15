import type { ApprovedRequest } from '../../egress';
import { validateAnswers, type DecisionQuestion } from '../../questions';
import type { Wire, WireReading } from '../wire';
import type { JevBody } from './jev-body';
import { isRecord } from '../../shared';

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
  const usage = isRecord(json.usage) ? json.usage : null;
  const usd = usage === null ? null : costOf(usage.cost);
  if (model === null || !isRecord(json.answers) || usage === null) {
    return { status: 'invalid', answers: null, model, usd, detail: 'the body lacks a model, answers or usage' };
  }
  const answers = validateAnswers(questions, json.answers);
  if (!answers) return { status: 'invalid', answers: null, model, usd, detail: 'an answer does not fit its question' };
  return { status: 'ok', answers, model, usd };
}

export const JEV_WIRE: Wire = Object.freeze({
  body: (model: string, req: ApprovedRequest) => jevBody(model, req),
  read: readJev,
});

function costOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
