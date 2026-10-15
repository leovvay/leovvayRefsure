import type { KeySource } from '../config';
import type { ProviderId } from '../questions';
import type { Endpoint } from './endpoint';

/** How the config sets one provider up: where it goes and which key pays. Holds no key value. */
export interface ProviderSlot {
  id: ProviderId;
  /** `null` when a gateway names the provider but its URL cannot be used. */
  endpoint: Endpoint | null;
  /** The source of the key that pays; `null` when the config turns that key off. */
  key: KeySource | null;
  /** The config key that pays: `openrouter`, `openai` or `gateway`. */
  keyName: 'openrouter' | 'openai' | 'gateway' | null;
  /** Why it cannot be asked whatever the key says, in words a human acts on; `null` when it can. */
  problem: string | null;
}
