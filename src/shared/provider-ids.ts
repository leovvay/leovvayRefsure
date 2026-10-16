/*
  Provider ids live here, not in `questions`, because egress reads them at run time (a consent grant or a log line
  naming another provider is not one of refsure's), and egress may import `questions` for types only.
*/

/** Every provider refsure can ask, in the order it asks them (Jev first): the one list every reader derives from. */
export const PROVIDER_IDS = ['jev', 'openai'] as const;

/** Whether `value` names a provider: a log line or a grant naming another is not one of refsure's. */
export function isProviderId(value: unknown): value is (typeof PROVIDER_IDS)[number] {
  return (PROVIDER_IDS as readonly unknown[]).includes(value);
}
