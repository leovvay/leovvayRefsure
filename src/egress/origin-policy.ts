import { originMatches, parseOriginPattern } from '../config';
import type { OriginPattern, RefsureConfig } from '../config';
import type { EgressRefusal } from './egress-refusal';

type OriginConfig = Pick<RefsureConfig, 'allowOrigins' | 'denyOrigins' | 'requireIsolatedProfile'>;

/**
 * `bank.example.` (a fully qualified name) is the same host as `bank.example`, so a trailing dot is dropped from
 * both sides before they are compared: a denied site stays denied whichever way the page spells it.
 */
function bareHost(host: string): string {
  return host.replace(/\.+$/, '');
}

function patterns(entries: readonly string[]): OriginPattern[] {
  // loadConfig refuses an unparseable entry, so a skipped one here can only come from a hand-built config.
  return entries
    .map(parseOriginPattern)
    .filter((pattern): pattern is OriginPattern => pattern !== null)
    .map((pattern) => ({ ...pattern, host: bareHost(pattern.host) }));
}

function parse(url: string): URL | null {
  try {
    const page = new URL(url);
    page.hostname = bareHost(page.hostname);
    return page;
  } catch {
    return null;
  }
}

/**
 * Deny wins; a non-empty allow list must match; `requireIsolatedProfile` refuses Orca's default profile,
 * and a tab whose profile is unknown (every agent-browser session), since the default one carries the user's
 * imported cookies.
 */
export function checkOrigin(url: string, cfg: OriginConfig, profileId: string | null): 'ok' | EgressRefusal {
  if (cfg.requireIsolatedProfile && (profileId === null || profileId === 'default')) {
    return {
      cause: 'origin_denied',
      detail: profileId === null
        ? 'requireIsolatedProfile is on and this tab reports no profile (an agent-browser session never does); '
          + 'open it in an isolated Orca profile'
        : 'requireIsolatedProfile is on and this tab uses Orca\'s default profile; open it in an isolated profile',
    };
  }
  const page = parse(url);
  const origin = page && (page.protocol === 'http:' || page.protocol === 'https:') ? page.origin : null;
  if (page && origin && patterns(cfg.denyOrigins).some((pattern) => originMatches(pattern, page))) {
    return { cause: 'origin_denied', detail: `${origin} is in denyOrigins` };
  }
  if (cfg.allowOrigins.length === 0) return 'ok';
  if (page && origin && patterns(cfg.allowOrigins).some((pattern) => originMatches(pattern, page))) return 'ok';
  return { cause: 'origin_denied', detail: `${origin ?? 'this page'} is not in allowOrigins` };
}
