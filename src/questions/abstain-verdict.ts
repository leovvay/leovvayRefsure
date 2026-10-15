import type { AbstainCause, AbstainVerdict } from './verdict';

/**
 * An abstain with no reading of the page: a route or provider failure, or an answer of the wrong kind. Nothing was
 * leaned to; `threshold` is the bar it would have been held to, when one applies.
 */
export function abstainVerdict<Out>(cause: AbstainCause, detail: string, threshold: number | null = null): AbstainVerdict<Out> {
  return { kind: 'abstain', cause, detail, leaned: null, confidence: null, threshold };
}
