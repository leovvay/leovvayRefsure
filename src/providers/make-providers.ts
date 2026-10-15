import type { RefsureConfig } from '../config';
import type { ProviderId } from '../questions';
import type { DecisionProvider } from './decision-provider';
import { endpointFor } from './endpoints';
import { httpProvider } from './http-provider';
import { JEV_WIRE } from './jev';
import { OPENAI_WIRE } from './openai';
import type { ProviderKeys } from './provider-keys';
import type { Wire } from './wire';

const WIRES: Readonly<Record<ProviderId, Wire>> = { jev: JEV_WIRE, openai: OPENAI_WIRE };

/**
 * The providers this config can ask. A gateway that names a provider replaces its direct endpoint and
 * pays with the gateway key; a provider whose endpoint or key source is missing is left out. No key is
 * read here: each `ask` reads its own.
 */
export function makeProviders(config: RefsureConfig, keys: ProviderKeys): { jev?: DecisionProvider; openai?: DecisionProvider } {
  const out: { jev?: DecisionProvider; openai?: DecisionProvider } = {};
  for (const id of ['jev', 'openai'] as const) {
    const endpoint = endpointFor(id, config.gateway);
    const key = endpoint ? keys[endpoint.key] : null;
    if (endpoint && key) out[id] = httpProvider(endpoint, WIRES[id], key);
  }
  return out;
}
