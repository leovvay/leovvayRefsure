export type SiteId = 'locate' | 'find' | 'dismiss' | 'page-state' | 'outcome' | 'presence' | 'option-map';
/** Every provider refsure can ask, in the order it asks them (Jev first): the one list every reader derives from. */
export const PROVIDER_IDS = ['jev', 'openai'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Whether `value` names a provider: a log line or a grant naming another is not one of refsure's. */
export function isProviderId(value: unknown): value is ProviderId {
  return (PROVIDER_IDS as readonly unknown[]).includes(value);
}
export type ProviderChoice = ProviderId | 'agree' | 'fallback';
export type Maturity = 'measured' | 'inherited' | 'experimental';
