import type { Ref } from '../browser';
import type { RiskReading } from '../risk';

export type StaleCause = 'page_changed' | 'ref_gone';

/** A fresh ref with the risk re-read on the fresh tree, or why the ticket no longer points at anything. */
export type RecheckResult = { ref: Ref; risk: RiskReading } | { stale: StaleCause };
