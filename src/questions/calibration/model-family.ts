import type { ProviderId } from '../site-id';

/** The families refsure's thresholds and maturities were taken on; any other family is new (spec §8.6). */
export const KNOWN_FAMILIES: Readonly<Record<ProviderId, string>> = Object.freeze({
  jev: 'jev-1.13',
  openai: 'gpt-6-luna',
});

/** A model's family: its name without a trailing `@…`, `-YYYYMMDD` or `-YYYY-MM-DD` snapshot suffix. */
export function familyOf(model: string): string {
  return model.trim().replace(/@.*$/, '').replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '');
}
