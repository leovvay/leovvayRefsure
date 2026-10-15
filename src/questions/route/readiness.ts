import type { ProviderId } from '../site-id';

/**
 * Per provider, why it cannot be asked now (no endpoint, no key, no consent), in words a human acts on, without its
 * key value; `null` when it can.
 */
export type Readiness = Readonly<Record<ProviderId, string | null>>;
