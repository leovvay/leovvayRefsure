import type { DecisionProvider } from '../../providers';
import type { ProviderId } from '../site-id';

/** Whether one provider can be asked right now, and why not, without its key value. */
export interface Readiness {
  id: ProviderId;
  provider: DecisionProvider | null;
  /** Where its requests go; consent is granted per host. */
  host: string | null;
  /** Why it cannot be asked now (no endpoint, no key, no consent), in words a human acts on; `null` when it can. */
  missing: string | null;
}
