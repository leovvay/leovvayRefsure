import { EGRESS_BYTES } from '../egress';

/*
  Every bound a Decision input is cut to, ported from the author's earlier
  decision code. A bound is part of the wording it measured with: raising one
  changes what a calibrated threshold is a claim about.
*/
export const BOUNDS = {
  /** A step intent or a wanted meaning: one sentence. */
  INTENT_MAX: 300,
  /** An overlay's visible text. */
  OVERLAY_MAX: 1_000,
  /** One page snapshot (page state, presence); Cyrillic at two bytes a letter still fits the state bound. */
  PAGE_MAX: 6_000,
  /** The page text inside a `state` page view: the production page view's own cap. */
  STATE_PAGE_TEXT_MAX: 1_500,
  /** Each side of an outcome, so before and after together fit where one page does. */
  OUTCOME_SIDE_MAX: 4_000,
  /** An expectation or a state's description. */
  DESCRIPTION_MAX: 500,
  URL_MAX: 300,
  /** One candidate line; a v1 line cuts its name at 90 characters, so this only bounds an odd one. */
  CANDIDATE_LINE_MAX: 600,
  /** The most candidates a choice is asked over (top-20 kept every labelled answer). */
  SHORTLIST_MAX: 20,
  /** The most controls of one overlay a dismiss is asked over. */
  DISMISS_MAX: 12,
  /**
   * Canonical JSON of the state, in UTF-8 bytes (spec §7.3): `approve` refuses more as `oversize`, and outcome fits
   * its two sides to it. Egress owns the number; it is here so the sites read every bound from one place.
   */
  STATE_MAX_BYTES: EGRESS_BYTES.STATE_MAX_BYTES,
  /** Canonical JSON of the questions, in UTF-8 bytes: `approve` refuses more, and a candidate site asks over fewer. */
  QUESTIONS_MAX_BYTES: EGRESS_BYTES.QUESTIONS_MAX_BYTES,
  /** One Decision's whole budget, retry included. */
  DEADLINE_MS: 5_000,
  /** A second attempt is made only when at least this much of the budget is left. */
  RETRY_MIN_REMAINING_MS: 500,
  RETRY_BACKOFF_MS: 100,
} as const;
