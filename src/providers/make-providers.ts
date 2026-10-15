import type { RefsureConfig } from '../config';
import type { ProviderId } from '../questions';
import type { DecisionProvider } from './decision-provider';
import { httpProvider } from './http-provider';
import { JEV_WIRE } from './jev';
import { OPENAI_WIRE } from './openai';
import type { ProviderKeys } from './provider-keys';
import { providerRoster } from './provider-roster';
import type { Wire } from './wire';

const WIRES: Readonly<Record<ProviderId, Wire>> = { jev: JEV_WIRE, openai: OPENAI_WIRE };

/**
 * The providers this config can ask: every roster slot with an endpoint and a key source, so `doctor`, `setup`
 * and `privacy` describe exactly the providers `ask` uses. A gateway that names a provider replaces its direct
 * endpoint and pays with the gateway key. No key is read here: each `ask` reads its own.
 */
export function makeProviders(config: RefsureConfig, keys: ProviderKeys): { jev?: DecisionProvider; openai?: DecisionProvider } {
  const out: { jev?: DecisionProvider; openai?: DecisionProvider } = {};
  for (const slot of Object.values(providerRoster(config, keys))) {
    if (slot.endpoint && slot.key) out[slot.id] = httpProvider(slot.endpoint, WIRES[slot.id], slot.key);
  }
  return out;
}
