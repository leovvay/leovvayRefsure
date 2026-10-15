import type { AxTree } from '../browser';

export interface RankOpts {
  /** Keeps the candidates whose row text contains `fold(within)`. The row needs `tree`; without it, the path. */
  within?: string;
  tree?: AxTree;
  /** How many to keep, at most 20 (the shortlist bound). */
  top?: number;
  /** A node index kept whatever its score, e.g. the ref `verify-target` checks. */
  keep?: number;
}
