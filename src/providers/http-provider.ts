import type { KeySource } from '../config';
import type { ApprovedRequest } from '../egress';
import type { DecisionProvider, ProviderAnswer, ProviderStatus } from './decision-provider';
import type { Endpoint } from './endpoint';
import { postDecision, scrubKey } from './transport';
import type { Wire } from './wire';

/** The most questions one request may carry (the earlier decision code's cap). */
const MAX_QUESTIONS = 40;
const MODEL_MAX = 120;

/**
 * A provider that POSTs one wire's body to one endpoint. The key is read per `ask` and dropped after the
 * call; `body` is the same object `ask` sends, without the key.
 */
export function httpProvider(endpoint: Endpoint, wire: Wire, key: KeySource): DecisionProvider {
  return {
    id: endpoint.provider,
    model: endpoint.model,
    host: endpoint.host,
    capabilities: { wire: wire.id, kinds: wire.kinds, refusal: wire.refusal, maxQuestions: MAX_QUESTIONS },
    body: (req, opts) => wire.body(endpoint.model, req, opts.rendering),
    async ask(req, opts) {
      // Consent and limits were granted for one provider at one host; nothing else may carry the request.
      if (req.provider !== endpoint.provider || req.host !== endpoint.host) {
        return failed('transport', 0, `the request was approved for ${req.provider} at ${req.host}, not ${endpoint.host}`);
      }
      if (Object.keys(req.questions).length > MAX_QUESTIONS) {
        return failed('invalid', 0, `more than ${MAX_QUESTIONS} questions in one request`);
      }
      const body = JSON.stringify(wire.body(endpoint.model, req, opts.rendering));
      let secret = await readKey(key);
      if (secret === null) return failed('transport', 0, `the key source ${key.label} gave no key`);
      const sent = await postDecision(
        endpoint.url,
        { ...endpoint.headers, authorization: `Bearer ${secret}` },
        body,
        { deadlineMs: opts.deadlineMs, signal: opts.signal },
        secret,
      );
      try {
        if (sent.status !== 'ok') return failed(sent.status, sent.ms, sent.detail ?? sent.status);
        return answered(req, wire, sent.json, sent.ms, secret);
      } finally {
        secret = null;
      }
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

/** A key source that throws is a missing key; nothing it threw is kept. */
async function readKey(key: KeySource): Promise<string | null> {
  try {
    const value = await key.read();
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

/** The answering model's name goes into the envelope and the log: bounded, one line, never the key. */
function modelName(model: string | null, secret: string): string | null {
  if (model === null) return null;
  const clean = scrubKey(model, secret).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, MODEL_MAX);
  return clean === '' ? null : clean;
}
