import { abstainVerdict } from '../abstain-verdict';
import type { DecisionSite } from '../decision-site';
import { NONE_KEY } from '../present-candidates';
import { wordingHash } from '../wording-hash';
import type { StepInput } from './site-inputs';
import { readStep } from './step-read';
import type { StepReading } from './step-reading';
import { type StepContext, STEP_QUESTIONS, stepRequest } from './step-request';
import { STEP_ROWS } from './starting-thresholds';
import {
  STEP_CLICK_INSTRUCTIONS, STEP_DONE_QUESTION, STEP_OPERATION_INSTRUCTIONS, STEP_OPERATIONS, STEP_SELECT_INSTRUCTIONS,
  STEP_TARGET_NONE, STEP_TYPE_INSTRUCTIONS,
} from './wordings';

/**
 * The wording's identity: every question's instructions and every fixed label, whatever a request offers. Rows,
 * values and page text are never hashed. Hashed on first read, as every site's wording is (`siteWording`).
 */
function stepWording(): { version: number; hash: string } {
  let hash: string | null = null;
  return {
    version: 1,
    get hash() {
      hash ??= wordingHash('choice', JSON.stringify([
        STEP_OPERATION_INSTRUCTIONS, STEP_CLICK_INSTRUCTIONS, STEP_TYPE_INSTRUCTIONS, STEP_SELECT_INSTRUCTIONS,
        STEP_DONE_QUESTION.instructions,
      ]), {
        ...STEP_OPERATIONS, [NONE_KEY]: STEP_TARGET_NONE,
        done_true: STEP_DONE_QUESTION.criteria?.true ?? '', done_false: STEP_DONE_QUESTION.criteria?.false ?? '',
      });
      return hash;
    },
  };
}

/**
 * `run`'s one Decision per step (design 2026-10-17 §2.2): the operation, a target head for each operation the page
 * offers (the element table; field × value pairs; select × option pairs), and with `--expect` the done Noul over
 * the new text, all in one request and read together (`readAll`). Jev only, experimental, by risk row.
 */
export const stepSite: DecisionSite<StepInput, StepContext, StepReading> = {
  id: 'step',
  kind: 'choice',
  question: STEP_QUESTIONS.operation,
  wording: stepWording(),
  policy: { threshold: { jev: STEP_ROWS }, maturity: 'experimental' },
  build: stepRequest,
  read() {
    return abstainVerdict('provider_error', 'the step site reads all its questions together');
  },
  readAll: readStep,
};
