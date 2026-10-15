import type { RefsureConfig } from '../../config';
import type { DecisionProvider, ProviderSlot } from '../../providers';
import type { ProviderId } from '../site-id';

/** What readiness is read from: the config, how it sets each provider up, the built providers and key presence. */
export interface ReadinessInputs {
  config: RefsureConfig;
  roster: Readonly<Record<ProviderId, ProviderSlot>>;
  providers: { jev?: DecisionProvider; openai?: DecisionProvider };
  /** Memoised per run: a command key source runs its command once. */
  keyPresent(id: ProviderId): Promise<boolean>;
}
