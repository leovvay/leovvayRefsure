import type { RefsureConfig } from '../config';
import { PROVIDER_IDS, type ProviderId } from '../questions';
import { endpointFor, gatewayNames } from './endpoints';
import type { ProviderKeys } from './provider-keys';
import type { ProviderSlot } from './provider-slot';
import { readKey } from './read-key';

function slotFor(id: ProviderId, config: RefsureConfig, keys: ProviderKeys): ProviderSlot {
  const endpoint = endpointFor(id, config.gateway);
  if (!endpoint) {
    const problem = gatewayNames(config.gateway, id)
      ? `the gateway config names ${id}, but its URL is not https (or loopback) or carries credentials`
      : `${id} has no endpoint`;
    return { id, endpoint: null, key: null, keyName: null, problem };
  }
  const key = keys[endpoint.key];
  const problem = key ? null : `${id} is turned off: the config sets keys.${endpoint.key} to null`;
  return { id, endpoint, key, keyName: endpoint.key, problem };
}

/**
 * Every provider as this config sets it up, in the order refsure asks them (Jev first). Pure: no key is read,
 * so a caller that wants presence reads `slot.key` itself and drops the value.
 */
export function providerRoster(config: RefsureConfig, keys: ProviderKeys): Readonly<Record<ProviderId, ProviderSlot>> {
  const out = {} as Record<ProviderId, ProviderSlot>;
  for (const id of PROVIDER_IDS) out[id] = slotFor(id, config, keys);
  return out;
}

/** Whether the key source gives a non-empty key now. The value is dropped at once; a throwing source is "no". */
export async function keyPresent(slot: ProviderSlot): Promise<boolean> {
  return slot.key !== null && (await readKey(slot.key)) !== null;
}
