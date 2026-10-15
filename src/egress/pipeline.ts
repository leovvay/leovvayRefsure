import type { DecisionQuestion, SiteRequest } from '../questions';
import { BOUNDS } from '../questions/bounds';
import type { ApprovedRequest } from './approved-request';
import type { ApproveContext } from './approve-context';
import { canonicalJson, sha256Hex, utf8Bytes } from './canonical';
import { cleanEgressText } from './clean-text';
import { consentMissing, grantFor, readConsent } from './consent';
import type { EgressRefusal } from './egress-refusal';
import { checkLimits } from './limits';
import { checkOrigin } from './origin-policy';

// The file, not the barrel: questions imports egress. Anything larger is `oversize` before any call (spec §7.3).
const { STATE_MAX_BYTES, QUESTIONS_MAX_BYTES } = BOUNDS;

const REFUSAL_CAUSES: ReadonlySet<unknown> = new Set(['not_set_up', 'origin_denied', 'oversize', 'spend_limit']);

export function isEgressRefusal(value: unknown): value is EgressRefusal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { cause?: unknown; detail?: unknown };
  return REFUSAL_CAUSES.has(candidate.cause) && typeof candidate.detail === 'string';
}

function consentRefusal(ctx: ApproveContext): EgressRefusal | null {
  const consent = readConsent(ctx.config.paths.consent);
  if (grantFor(consent, ctx.provider, ctx.host)) return null;
  return { cause: 'not_set_up', detail: consentMissing(consent, ctx.provider, ctx.host) };
}

type Clean = (text: string) => string;

// Cleaning is idempotent and some builders already did it; here it guarantees nothing leaves uncleaned.
function cleaner(masks: boolean): Clean {
  return (text) => cleanEgressText(text, masks);
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
 * The only constructor of `ApprovedRequest`. In order: consent (skipped under dryRun), origin (skipped for synthetic
 * input), secret redaction plus PII masks over every string leaf, byte bounds, spend limits. The first failure wins.
 */
export function approve(req: SiteRequest, ctx: ApproveContext): ApprovedRequest | EgressRefusal {
  if (!ctx.dryRun) {
    const refusal = consentRefusal(ctx);
    if (refusal) return refusal;
  }
  if (ctx.originUrl !== null) {
    const origin = checkOrigin(ctx.originUrl, ctx.config, ctx.profileId);
    if (origin !== 'ok') return origin;
  }

  const clean = cleaner(ctx.config.piiMasks);
  const state = cleanValues(req.state, clean);
  const questions: Readonly<Record<string, DecisionQuestion>> = Object.freeze(Object.fromEntries(
    Object.entries(req.questions).map(([name, question]) => [name, cleanQuestion(question, clean)]),
  ));
  const stateBytes = utf8Bytes(canonicalJson(state));
  if (stateBytes > STATE_MAX_BYTES) return oversize('state', stateBytes, STATE_MAX_BYTES);
  const questionBytes = utf8Bytes(canonicalJson(questions));
  if (questionBytes > QUESTIONS_MAX_BYTES) return oversize('questions', questionBytes, QUESTIONS_MAX_BYTES);

  const limits = checkLimits(ctx.egressLog, ctx.config, ctx.nowMs, ctx.pending);
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
