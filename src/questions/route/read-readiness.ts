import { DISCLOSURE_HASH, grantFor, readConsent } from '../../egress';
import type { Consent } from '../../egress';
import type { ProviderSlot } from '../../providers';
import type { ProviderId } from '../site-id';
import type { Readiness } from './readiness';
import type { ReadinessInputs } from './readiness-inputs';

function noKey(slot: ProviderSlot): string {
  if (!slot.key) return slot.problem ?? `${slot.id} has no key source`;
  const isEnv = /^[A-Z_][A-Z0-9_]*$/.test(slot.key.label);
  return isEnv
    ? `no ${slot.id} key: set ${slot.key.label} (keys.${slot.keyName})`
    : `no ${slot.id} key: the key command ${slot.key.label} gave none (keys.${slot.keyName})`;
}

function noGrant(consent: Consent | null, id: ProviderId, host: string): string {
  if (consent && consent.disclosure !== DISCLOSURE_HASH) {
    return `the disclosure changed since consent was given: a human runs \`refsure setup\` again to grant ${id} at ${host}`;
  }
  return `no consent grant for ${id} at ${host}: a human runs \`refsure setup\` in a terminal`;
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
  if (!dryRun && !grantFor(consent, id, host)) return noGrant(consent, id, host);
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
