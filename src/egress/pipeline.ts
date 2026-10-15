import type { DecisionQuestion, SiteRequest } from '../questions';
import type { ApprovedRequest } from './approved-request';
import type { ApproveContext } from './approve-context';
import { stripControl } from './bound-text';
import { canonicalJson, sha256Hex, utf8Bytes } from './canonical';
import { grantFor, readConsent } from './consent';
import { DISCLOSURE_HASH } from './disclosure';
import type { EgressRefusal } from './egress-refusal';
import { checkLimits } from './limits';
import { checkOrigin } from './origin-policy';
import { maskPii } from './pii-masks';
import { redactSecrets } from './redact';

/** Spec §7.3: anything larger is `oversize` before any call is made. Measured on canonical JSON, UTF-8. */
export const STATE_MAX_BYTES = 24_000;
export const QUESTIONS_MAX_BYTES = 12_000;

const REFUSAL_CAUSES: ReadonlySet<unknown> = new Set(['not_set_up', 'origin_denied', 'oversize', 'spend_limit']);

export function isEgressRefusal(value: unknown): value is EgressRefusal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { cause?: unknown; detail?: unknown };
  return REFUSAL_CAUSES.has(candidate.cause) && typeof candidate.detail === 'string';
}

function consentRefusal(ctx: ApproveContext): EgressRefusal | null {
  const consent = readConsent(ctx.config.paths.consent);
  if (grantFor(consent, ctx.provider, ctx.host)) return null;
  const grant = `${ctx.provider} at ${ctx.host}`;
  const detail = consent && consent.disclosure !== DISCLOSURE_HASH
    ? `the disclosure changed since consent was given; a human runs \`refsure setup\` again to grant ${grant}`
    : `no consent grant for ${grant}; a human runs \`refsure setup\` in a terminal`;
  return { cause: 'not_set_up', detail };
}

type Clean = (text: string) => string;

// Strip is idempotent and the builders already did it; here it guarantees no control byte leaves.
function cleaner(masks: boolean): Clean {
  return (text) => {
    const redacted = redactSecrets(stripControl(text));
    return masks ? maskPii(redacted) : redacted;
  };
}

function cleanValues(record: Readonly<Record<string, string>>, clean: Clean): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(record).map(([key, value]) => [key, clean(String(value))])));
}

// A fresh object with only the wire fields; criteria keys are the answer vocabulary and stay untouched.
function cleanQuestion(question: DecisionQuestion, clean: Clean): DecisionQuestion {
  const instructions = clean(question.instructions);
  if (question.type === 'choice') {
    return Object.freeze({ type: 'choice', instructions, criteria: cleanValues(question.criteria, clean) });
  }
  if (!question.criteria) return Object.freeze({ type: 'noul', instructions });
  const criteria = Object.freeze({ true: clean(question.criteria.true), false: clean(question.criteria.false) });
  return Object.freeze({ type: 'noul', instructions, criteria });
}

function oversize(part: string, bytes: number, max: number): EgressRefusal {
  return { cause: 'oversize', detail: `${part} is ${bytes} bytes of canonical JSON; the limit is ${max}` };
}

/**
 * The only constructor of `ApprovedRequest`. In order: consent (skipped under dryRun), origin, secret
 * redaction plus PII masks over every string leaf, byte bounds, spend limits. The first failure wins.
 */
export function approve(req: SiteRequest, ctx: ApproveContext): ApprovedRequest | EgressRefusal {
  if (!ctx.dryRun) {
    const refusal = consentRefusal(ctx);
    if (refusal) return refusal;
  }
  const origin = checkOrigin(ctx.originUrl, ctx.config, ctx.profileId);
  if (origin !== 'ok') return origin;

  const clean = cleaner(ctx.config.piiMasks);
  const state = cleanValues(req.state, clean);
  const questions: Readonly<Record<string, DecisionQuestion>> = Object.freeze(Object.fromEntries(
    Object.entries(req.questions).map(([name, question]) => [name, cleanQuestion(question, clean)]),
  ));
  const stateBytes = utf8Bytes(canonicalJson(state));
  if (stateBytes > STATE_MAX_BYTES) return oversize('state', stateBytes, STATE_MAX_BYTES);
  const questionBytes = utf8Bytes(canonicalJson(questions));
  if (questionBytes > QUESTIONS_MAX_BYTES) return oversize('questions', questionBytes, QUESTIONS_MAX_BYTES);

  const limits = checkLimits(ctx.egressLog, ctx.config, ctx.nowMs);
  if (limits !== 'ok') return limits;

  const json = canonicalJson({ state, questions });
  return Object.freeze({
    site: ctx.site,
    provider: ctx.provider,
    host: ctx.host,
    state,
    questions,
    bytes: utf8Bytes(json),
    digest: sha256Hex(json),
  }) as ApprovedRequest;
}
