import type { KeySource } from '../config';
import type { ApprovedRequest } from '../egress';
import { bareModel } from '../questions';
import type { DecisionProvider, ProviderAnswer, ProviderStatus } from './decision-provider';
import type { Endpoint } from './endpoint';
import { readKey } from './read-key';
import { postDecision, scrubKey } from './transport';
import type { Wire } from './wire';

/** The most questions one request may carry (the earlier decision code's cap). */
const MAX_QUESTIONS = 40;
const MODEL_MAX = 120;

/**
 * A provider that POSTs one wire's body to one endpoint. The key is read per `ask`, never stored; `body` is the
 * same object `ask` sends, without the key.
 */
export function httpProvider(endpoint: Endpoint, wire: Wire, key: KeySource): DecisionProvider {
  return {
    id: endpoint.provider,
    model: endpoint.model,
    host: endpoint.host,
    body: (req, opts) => wire.body(endpoint.model, req, opts.rendering),
    async ask(req, opts) {
      // Consent and limits were granted for one provider at one host; nothing else may carry the request.
      if (req.provider !== endpoint.provider || req.host !== endpoint.host) {
        return unsent('transport', `the request was approved for ${req.provider} at ${req.host}, not ${endpoint.host}`);
      }
      if (Object.keys(req.questions).length > MAX_QUESTIONS) {
        return unsent('invalid', `more than ${MAX_QUESTIONS} questions in one request`);
      }
      const body = JSON.stringify(wire.body(endpoint.model, req, opts.rendering));
      const secret = await readKey(key);
      if (secret === null) return unsent('transport', `the key source ${key.label} gave no key`);
      if (opts.signal.aborted) return unsent('transport', 'interrupted before the request was sent');
      const sent = await postDecision(
        endpoint.url,
        { ...endpoint.headers, authorization: `Bearer ${secret}` },
        body,
        { deadlineMs: opts.deadlineMs, signal: opts.signal },
        secret,
      );
      if (sent.status !== 'ok') return failed(sent.status, sent.ms, sent.detail ?? sent.status);
      return answered(req, wire, sent.json, sent.ms, secret);
    },
  };
}

function answered(req: ApprovedRequest, wire: Wire, json: unknown, ms: number, secret: string): ProviderAnswer {
  const reading = wire.read(json, req.questions);
  return {
    status: reading.status,
    answers: reading.status === 'ok' ? reading.answers : null,
    model: modelName(reading.model, secret),
    usd: reading.usd,
    ms,
    ...(reading.detail === undefined ? {} : { detail: reading.detail }),
  };
}

function failed(status: ProviderStatus, ms: number, detail: string): ProviderAnswer {
  return { status, answers: null, model: null, usd: null, ms, detail };
}

/** A refusal before anything left: no request reached the network. */
function unsent(status: ProviderStatus, detail: string): ProviderAnswer {
  return { ...failed(status, 0, detail), unsent: true };
}

/**
 * The answering model's name goes into the envelope and the log: bounded, one line, never the key, and without
 * the `vendor/` prefix a router adds, so `typesafe/jev-1.13` reads as the known family `jev-1.13`.
 */
function modelName(model: string | null, secret: string): string | null {
  if (model === null) return null;
  const clean = bareModel(scrubKey(model, secret).replace(/[\u0000-\u001f\u007f-\u009f]/g, '')).slice(0, MODEL_MAX);
  return clean === '' ? null : clean;
}
