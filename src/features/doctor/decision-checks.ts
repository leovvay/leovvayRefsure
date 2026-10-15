import { statSync } from 'node:fs';
import type { CommandContext } from '../../cli';
import { keySet } from '../../config';
import { DISCLOSURE_HASH, grantFor, readConsent, readEgressLog } from '../../egress';
import { gatewayNames, keyPresent, providerRoster } from '../../providers';
import type { ProviderSlot } from '../../providers';
import { bareModel, familyOf, KNOWN_FAMILIES, snapshotChanged } from '../../questions';
import type { DoctorCheck } from './doctor-check';

function keysCheck(slots: readonly ProviderSlot[], present: readonly boolean[]): DoctorCheck {
  const parts = slots.map((slot, i) => {
    if (slot.problem !== null) return `${slot.id}: ${slot.problem}`;
    return `${slot.id}: ${slot.key?.label ?? 'no key source'} ${present[i] ? 'present' : 'missing'}`;
  });
  return { name: 'keys', ok: present.some(Boolean), detail: parts.join('; ') };
}

function consentCheck(ctx: CommandContext, slots: readonly ProviderSlot[], present: readonly boolean[]): DoctorCheck {
  const consent = readConsent(ctx.config.paths.consent);
  if (!consent) return { name: 'consent', ok: false, detail: 'no consent on file: a human runs `refsure setup` in a terminal' };
  const current = consent.disclosure === DISCLOSURE_HASH;
  const grants = slots.flatMap((slot) => {
    const host = slot.endpoint?.host;
    return host ? [{ slot, host, granted: grantFor(consent, slot.id, host) }] : [];
  });
  const usable = grants.some((grant) => grant.granted && present[slots.indexOf(grant.slot)]);
  const listed = grants.map((grant) => `${grant.slot.id} at ${grant.host} ${grant.granted ? 'granted' : 'not granted'}`);
  const head = current ? 'disclosure current' : 'the disclosure changed since consent: a human runs `refsure setup` again';
  return { name: 'consent', ok: current && usable, detail: [head, ...listed].join('; ') };
}

function configCheck(ctx: CommandContext): DoctorCheck {
  const { paths, gateway, limits } = ctx.config;
  let file: string;
  try {
    const mode = (statSync(paths.config).mode & 0o777).toString(8).padStart(4, '0');
    file = `${paths.config} (mode ${mode})`;
  } catch {
    file = `${paths.config}: no file, defaults in use`;
  }
  const named = (['jev', 'openai'] as const).filter((id) => gatewayNames(gateway, id));
  const via = gateway ? `gateway ${gateway.url} for ${named.length > 0 ? named.join(', ') : 'nothing (no paths named)'}` : 'no gateway';
  const caps = `${limits.decisionsPerMinute} Decisions/min, $${limits.usdPerDay}/day`;
  return { name: 'config', ok: true, detail: `${file}; ${via}; ${caps}` };
}

/** The last model each provider answered with, from egress.log, against the families refsure was measured on. */
function driftCheck(ctx: CommandContext): DoctorCheck {
  const entries = readEgressLog(ctx.config.paths.egressLog, 0);
  let ok = true;
  const parts = (['jev', 'openai'] as const).map((id) => {
    const last = entries.filter((entry) => entry.provider === id && entry.model !== null).at(-1);
    if (!last?.model) return `${id}: no answers logged`;
    const model = bareModel(last.model);
    const known = KNOWN_FAMILIES[id];
    if (familyOf(model) !== known) {
      ok = false;
      return `${id}: ${model} is a new family (measured: ${known}); its answers carry authority none`;
    }
    return snapshotChanged(id, known, model)
      ? `${id}: warning: ${model} is a new snapshot of ${known} (model_changed)`
      : `${id}: ${model}`;
  });
  return { name: 'drift', ok, detail: parts.join('; ') };
}

/** Keys (names and presence, never values), consent, config and model drift (spec §6.3 doctor). */
export async function decisionChecks(ctx: CommandContext): Promise<DoctorCheck[]> {
  const slots = Object.values(providerRoster(ctx.config, keySet(ctx.config, ctx.env)));
  const present = await Promise.all(slots.map((slot) => (slot.problem === null ? keyPresent(slot) : false)));
  return [keysCheck(slots, present), consentCheck(ctx, slots, present), configCheck(ctx), driftCheck(ctx)];
}
