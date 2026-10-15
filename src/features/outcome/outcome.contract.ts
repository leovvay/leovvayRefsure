/**
 * `refsure outcome`: `landed` when code or the outcome Decision saw the intent happen, else `unknown`; never
 * "failed" (spec §8.1 rule 6). `rule` names the code rule that settled it; `unconfirmed` the Decision's own cause
 * when it did not say landed (`low_confidence`, `provider_timeout`, ...).
 */
export interface OutcomeResult {
  verdict: 'landed' | 'unknown';
  by: 'code' | 'decision';
  rule?: 'expect_url' | 'expect_text';
  unconfirmed?: string;
}
