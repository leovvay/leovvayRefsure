/**
 * The egress byte bounds (spec §7.3): canonical JSON in UTF-8 bytes. `approve` refuses a request over either as
 * `oversize` before any call. Questions' `BOUNDS` repeats them for the sites that fit their input under them.
 */
export const EGRESS_BYTES = {
  /** The request state: outcome fits its two sides to it. */
  STATE_MAX_BYTES: 24_000,
  /** The questions: a candidate site asks over fewer options rather than go over. */
  QUESTIONS_MAX_BYTES: 12_000,
} as const;
