import type { ProviderId } from '../site-id';

/** The families refsure's thresholds and maturities were taken on; any other family is new (spec §8.6). */
export const KNOWN_FAMILIES: Readonly<Record<ProviderId, string>> = Object.freeze({
  jev: 'jev-1.13',
  openai: 'gpt-6-luna',
});

/**
 * A model name without the `vendor/` routing prefix a gateway or router puts in front (`openai/gpt-6-luna`,
 * `typesafe/jev-1.13`): the prefix says who served it, not which model it is.
 */
export function bareModel(model: string): string {
  return model.trim().replace(/^(?:[^/\s]+\/)+/, '');
}

/** A model's family: its bare name without a trailing `@…`, `-YYYYMMDD` or `-YYYY-MM-DD` snapshot suffix. */
export function familyOf(model: string): string {
  return bareModel(model).replace(/@.*$/, '').replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '');
}

/**
 * The dated snapshot of each known family this release was proven on. An answer from another snapshot of the same
 * family keeps its maturity and sets `model_changed` (spec §8.6). OpenAI has no pin until a live answer shows the
 * dated name it answers with; until then its snapshots cannot be told apart, so none reads as a change.
 */
export const KNOWN_SNAPSHOTS: Readonly<Partial<Record<ProviderId, string>>> = Object.freeze({
  jev: 'jev-1.13-20260917',
});

/**
 * Whether `answered` is another snapshot of the family asked for: compared with the requested model when that names
 * a snapshot itself (a gateway can pin one), else with the provider's pinned snapshot. With neither there is no
 * reference: an undated alias answering with its dated name is the alias resolving, not a change. A new family is
 * not a snapshot change (it is `newFamily`), and an answer that names no snapshot cannot be told apart.
 */
export function snapshotChanged(provider: ProviderId, requested: string, answered: string): boolean {
  if (familyOf(answered) !== familyOf(requested) || bareModel(answered) === familyOf(answered)) return false;
  const asked = bareModel(requested);
  const reference = asked !== familyOf(requested) ? asked : KNOWN_SNAPSHOTS[provider];
  return reference !== undefined && bareModel(answered) !== reference;
}
