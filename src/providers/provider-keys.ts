import type { KeySource } from '../config';

/** The configured key sources, one per account (the shape `config/keys` builds). */
export interface ProviderKeys {
  openrouter: KeySource | null;
  openai: KeySource | null;
  gateway: KeySource | null;
}
