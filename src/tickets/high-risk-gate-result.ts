import type { Ref } from '../browser';
import type { RiskReading } from '../risk';

/**
 * The gate's answer. Cleared: the ref to act on now, the fresh risk that matched `--class`, and the element as
 * `<role> "<name>"` (page text). Stopped: a named cause before anything was dispatched; `computed` is the fresh
 * risk when the class did not match.
 */
export type HighRiskGateResult =
  | { ok: true; ref: Ref; risk: RiskReading; element: string }
  | {
    ok: false;
    status: 'refused' | 'stale' | 'abstained';
    cause: string;
    detail: string;
    computed?: RiskReading;
  };
