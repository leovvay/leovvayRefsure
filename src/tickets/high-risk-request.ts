import type { ActAction, PageRef, Ref } from '../browser';
import type { RiskClass } from '../risk';
import type { Ticket } from './ticket';

/**
 * What `act-high-risk` asks the gate to clear (spec §6.3): the class the caller names, the action, and the element,
 * by a peeked ticket or by a live ref with the name the caller saw on it. `risk` is the caller's `--risk`, which
 * only raises the fresh read, as it does on every other path (spec §8.1 invariant 4).
 */
export type HighRiskRequest = {
  class: RiskClass;
  action: ActAction;
  page: PageRef;
  risk?: RiskClass;
} & ({ ticket: Ticket } | { ref: Ref; expectName: string });
