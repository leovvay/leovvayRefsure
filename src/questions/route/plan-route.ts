import type { DecideOpts } from '../decide-fn';
import type { ProviderId, SiteId } from '../site-id';
import type { SitePolicy } from '../site-policy';
import type { Readiness } from './readiness';
import type { RoutePlan } from './route-plan';

type Combo = NonNullable<DecideOpts['combo']>;

const IDS: readonly ProviderId[] = ['jev', 'openai'];

function hasRow(policy: SitePolicy, id: ProviderId): boolean {
  return policy.threshold[id] !== undefined;
}

/** May answer this site on its own: a threshold row, and named in `solo` when the site restricts it. */
function mayAnswerAlone(policy: SitePolicy, id: ProviderId): boolean {
  return hasRow(policy, id) && (policy.solo ?? IDS).includes(id);
}

/** Who may answer the site, as the refusal names it (spec §7.1 allowlist). */
function allowedText(site: SiteId, policy: SitePolicy): string {
  const alone = IDS.filter((id) => mayAnswerAlone(policy, id));
  const options = [...alone, ...(policy.combos ?? [])];
  return `${site} is answered by ${options.join(' or ')}`;
}

function notAllowed(detail: string): RoutePlan {
  return { kind: 'refused', cause: 'provider_not_allowed', detail };
}

function notSetUp(missing: readonly string[]): RoutePlan {
  return { kind: 'refused', cause: 'not_set_up', detail: missing.join('; ') };
}

/**
 * The route for one Decision (spec §7.1, §13). An explicit combo outside the site's allowlist is
 * `provider_not_allowed`; an allowed one whose providers are not ready is `not_set_up`, naming what is missing.
 * `auto`: both ready → the site's combo (`agree` for dismiss and presence, `fallback` for page state); else the
 * first ready provider that may answer alone. A provider without a consent grant counts as not configured, so
 * `agree` drops to Jev alone rather than failing (spec §8.6).
 */
export function planRoute(
  site: SiteId,
  policy: SitePolicy,
  combo: Combo,
  ready: Readiness,
): RoutePlan {
  const combos = policy.combos ?? [];
  const usable = (id: ProviderId): boolean => ready[id] === null;
  const missingOf = (ids: readonly ProviderId[]): string[] => ids.flatMap((id) => {
    const why = ready[id];
    return why === null ? [] : [why];
  });
  if (combo === 'jev' || combo === 'openai') {
    if (!mayAnswerAlone(policy, combo)) return notAllowed(`${combo} may not answer ${site} alone: ${allowedText(site, policy)}`);
    return usable(combo) ? { kind: 'single', provider: combo } : notSetUp(missingOf([combo]));
  }
  if (combo === 'agree' || combo === 'fallback') {
    if (!combos.includes(combo)) return notAllowed(`${combo} is not offered at ${site}: ${allowedText(site, policy)}`);
    const missing = missingOf(IDS);
    return missing.length === 0 ? { kind: combo } : notSetUp(missing);
  }
  if (usable('jev') && usable('openai')) {
    if (combos.includes('agree')) return { kind: 'agree' };
    if (combos.includes('fallback')) return { kind: 'fallback' };
  }
  const alone = IDS.find((id) => usable(id) && mayAnswerAlone(policy, id));
  if (alone) return { kind: 'single', provider: alone };
  const readyButBarred = IDS.filter(usable);
  if (readyButBarred.length > 0) {
    return notAllowed(`only ${readyButBarred.join(' and ')} is set up, and ${allowedText(site, policy)}`);
  }
  return notSetUp(missingOf(IDS.filter((id) => hasRow(policy, id))));
}
