import type { CommandSpec, UsageError } from '../../cli';
import { resolvePaths } from '../../config';
import type { RefsureConfig } from '../../config';
import { DISCLOSURE_HASH, DISCLOSURE_TEXT, grantFor, readConsent } from '../../egress';
import type { Consent } from '../../egress';
import { PROVIDER_IDS, type ProviderId } from '../../questions';
import { readConfig, rosterOf } from '../shared';
import type { PrivacyProvider } from './privacy-provider';
import type { PrivacyResult } from './privacy.contract';

function providersOf(config: RefsureConfig, consent: Consent | null, env: NodeJS.ProcessEnv): Record<ProviderId, PrivacyProvider> {
  const providers = {} as Record<ProviderId, PrivacyProvider>;
  for (const slot of Object.values(rosterOf(config, env))) {
    const host = slot.endpoint?.host ?? null;
    providers[slot.id] = {
      host,
      key: slot.key?.label ?? null,
      configured: slot.problem === null,
      granted: host !== null && grantFor(consent, slot.id, host),
    };
  }
  return providers;
}

/** Every provider, none of them usable: a refused config file sends nothing. */
function unusable(): Record<ProviderId, PrivacyProvider> {
  const none: PrivacyProvider = { host: null, key: null, configured: false, granted: false };
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, none])) as Record<ProviderId, PrivacyProvider>;
}

/**
 * What leaves the machine, and under which consent (spec §7.3). Reads local files only; no key is read. A refused
 * config file still shows the disclosure and the grants, and says that nothing leaves.
 */
export const privacyCommand: CommandSpec<Record<string, never>, PrivacyResult> = {
  name: 'privacy',
  summary: 'Show what leaves your machine, where it goes, and the consent grants on file',
  since: '0.1.0',
  stability: 'stable',
  options: {},
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw): Record<string, never> | UsageError {
    if (raw.positionals.length > 0) return { usage: `privacy takes no arguments, got ${raw.positionals.length}` };
    return {};
  },
  async run(_args, ctx) {
    const state = readConfig(ctx);
    const config = 'config' in state ? state.config : null;
    const refused = 'refused' in state
      ? { cause: state.refused.cause_, detail: `${state.refused.detail}; nothing leaves until it is fixed` }
      : null;
    const paths = config?.paths ?? resolvePaths(ctx.env);
    const consent = readConsent(paths.consent);
    const result: PrivacyResult = {
      disclosure: DISCLOSURE_TEXT,
      hash: DISCLOSURE_HASH,
      grants: consent?.grants ?? [],
      consent_current: consent !== null && consent.disclosure === DISCLOSURE_HASH,
      providers: config ? providersOf(config, consent, ctx.env) : unusable(),
      pii_masks: config?.piiMasks ?? null,
      allow_origins: config ? [...config.allowOrigins] : null,
      deny_origins: config ? [...config.denyOrigins] : null,
      require_isolated_profile: config?.requireIsolatedProfile ?? null,
      egress_log: paths.egressLog,
      config: { path: paths.config, refused },
    };
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
