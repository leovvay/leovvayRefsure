import type { ProviderId } from '../site-id';

/** Who answers one Decision: one provider, both (`agree`), Jev then OpenAI (`fallback`), or nobody, and why. */
export type RoutePlan =
  | { kind: 'single'; provider: ProviderId }
  | { kind: 'agree' }
  | { kind: 'fallback' }
  | { kind: 'refused'; cause: 'not_set_up' | 'provider_not_allowed'; detail: string };
