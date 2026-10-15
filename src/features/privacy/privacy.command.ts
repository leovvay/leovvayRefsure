import type { CommandSpec, UsageError } from '../../cli';
import { keySet } from '../../config';
import { DISCLOSURE_HASH, DISCLOSURE_TEXT, grantFor, readConsent } from '../../egress';
import { providerRoster } from '../../providers';
import type { ProviderId } from '../../questions';
import type { PrivacyProvider } from './privacy-provider';
import type { PrivacyResult } from './privacy.contract';

/** What leaves the machine, and under which consent (spec §7.3). Reads local files only; no key is read. */
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
    const config = ctx.config;
    const consent = readConsent(config.paths.consent);
    const roster = providerRoster(config, keySet(config, ctx.env));
    const providers = {} as Record<ProviderId, PrivacyProvider>;
    for (const slot of Object.values(roster)) {
      const host = slot.endpoint?.host ?? null;
      providers[slot.id] = {
        host,
        key: slot.key?.label ?? null,
        configured: slot.problem === null,
        granted: host !== null && grantFor(consent, slot.id, host),
      };
    }
    const result: PrivacyResult = {
      disclosure: DISCLOSURE_TEXT,
      hash: DISCLOSURE_HASH,
      grants: consent?.grants ?? [],
      consent_current: consent !== null && consent.disclosure === DISCLOSURE_HASH,
      providers,
      pii_masks: config.piiMasks,
      allow_origins: [...config.allowOrigins],
      deny_origins: [...config.denyOrigins],
      require_isolated_profile: config.requireIsolatedProfile,
      egress_log: config.paths.egressLog,
    };
    return { status: 'ok', acted: false, effect: 'none', result };
  },
};
