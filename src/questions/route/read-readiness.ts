import { consentMissing, grantFor, readConsent } from '../../egress';
import type { Consent } from '../../egress';
import type { ProviderSlot } from '../../providers';
import type { ProviderId } from '../site-id';
import type { Readiness } from './readiness';
import type { ReadinessInputs } from './readiness-inputs';

function noKey(slot: ProviderSlot): string {
  if (!slot.key) return slot.problem ?? `${slot.id} has no key source`;
  return slot.key.kind === 'env'
    ? `no ${slot.id} key: set ${slot.key.label} (keys.${slot.keyName})`
    : `no ${slot.id} key: the key command ${slot.key.label} gave none (keys.${slot.keyName})`;
}

/** Why `id` cannot be asked now, or `null` when it can. */
async function readOne(
  inputs: ReadinessInputs,
  id: ProviderId,
  consent: Consent | null,
  dryRun: boolean,
): Promise<string | null> {
  const slot = inputs.roster[id];
  const host = slot.endpoint?.host ?? null;
  if (slot.problem !== null || !inputs.providers[id] || host === null) {
    return slot.problem ?? `${id} is not configured`;
  }
  if (!(await inputs.keyPresent(id))) return noKey(slot);
  // A dry run skips consent (spec §6.1): it sends nothing, and shows what a granted run would send.
  if (!dryRun && !grantFor(consent, id, host)) return consentMissing(consent, id, host);
  return null;
}

/** Both providers' readiness: endpoint, key present, and (unless a dry run) a consent grant for the host. */
export async function readReadiness(inputs: ReadinessInputs, dryRun: boolean): Promise<Readiness> {
  const consent = dryRun ? null : readConsent(inputs.config.paths.consent);
  const [jev, openai] = await Promise.all([
    readOne(inputs, 'jev', consent, dryRun),
    readOne(inputs, 'openai', consent, dryRun),
  ]);
  return { jev, openai };
}
