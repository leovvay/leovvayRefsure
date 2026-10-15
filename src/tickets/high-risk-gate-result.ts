import type { Ref } from '../browser';

/**
 * The gate's answer. Cleared: the ref to act on now (its fresh risk matched `--class`), and the element as
 * `<role> "<name>"` (page text). Stopped: a named cause before anything was dispatched; a class mismatch names the
 * fresh class and its reasons in `detail`.
 */
export type HighRiskGateResult =
  | { ok: true; ref: Ref; element: string }
  | { ok: false; status: 'refused' | 'stale' | 'abstained'; cause: string; detail: string };
