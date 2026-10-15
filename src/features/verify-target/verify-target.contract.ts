/**
 * `refsure verify-target`: whether an independent `find` over the page named the same element. Agreement adds no
 * authority; anything else refuses. `line` (the ref's element) and `pick` (what the second look named) are page text.
 */
export interface VerifyTargetResult {
  agrees: boolean;
  line: string;
  pick?: string;
  /** Why the second look named nothing: the abstain's own cause. */
  unconfirmed?: string;
}
