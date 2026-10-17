import type { PROVIDER_IDS } from '../shared';

export type SiteId = 'locate' | 'find' | 'dismiss' | 'page-state' | 'outcome' | 'presence' | 'option-map' | 'step';
/** One of `PROVIDER_IDS` (in `shared`, since egress reads it at run time): Jev first, the order refsure asks in. */
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderChoice = ProviderId | 'agree' | 'fallback';
export type Maturity = 'measured' | 'inherited' | 'experimental';
