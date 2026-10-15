import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
// The file, not the barrel: questions imports egress, and site-id imports nothing.
import { isProviderId, type ProviderId } from '../questions/site-id';
import type { Consent, ConsentGrant } from './consent-record';
import { DISCLOSURE_HASH } from './disclosure';
import { writePrivateFile } from './private-file';
import { isRecord } from '../shared';


function asGrant(value: unknown): ConsentGrant | null {
  if (!isRecord(value)) return null;
  const { provider, host, at } = value;
  if (!isProviderId(provider)) return null;
  if (typeof host !== 'string' || host === '' || typeof at !== 'string') return null;
  return { provider, host, at };
}

/**
 * The consent record, or `null` when it is missing, unreadable, not a v1 record, or writable by anyone but
 * its owner (someone else could then grant on the owner's behalf). A malformed grant is dropped, not trusted.
 */
export function readConsent(path: string): Consent | null {
  let fd: number;
  try {
    // Non-blocking, so a FIFO here cannot hang the open; the fstat below refuses anything but a regular file.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o022) !== 0) return null;
    const parsed: unknown = JSON.parse(readFileSync(fd, 'utf8'));
    if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.disclosure !== 'string' || !Array.isArray(parsed.grants)) {
      return null;
    }
    const grants = parsed.grants.map(asGrant).filter((grant): grant is ConsentGrant => grant !== null);
    return { v: 1, disclosure: parsed.disclosure, grants };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/** Writes 0600 through a temp file and a rename; the directory is created 0700 when missing. */
export function writeConsent(path: string, consent: Consent): void {
  writePrivateFile(path, `${JSON.stringify(consent, null, 2)}\n`);
}

/** Whether a grant is for this provider at this host: hosts compare without case. */
function grants(grant: ConsentGrant, provider: ProviderId, host: string): boolean {
  return grant.provider === provider && grant.host.toLowerCase() === host.toLowerCase();
}

/**
 * The record under today's disclosure: its grants when it was given for this one, else none. Grants given for an
 * older disclosure are dropped: the human has not read this one for them.
 */
export function currentConsent(consent: Consent | null): Consent {
  const grants = consent && consent.disclosure === DISCLOSURE_HASH ? consent.grants : [];
  return { v: 1, disclosure: DISCLOSURE_HASH, grants };
}

/** True only when the record was given for today's disclosure and holds this provider at this host. */
export function grantFor(consent: Consent | null, provider: ProviderId, host: string): boolean {
  return currentConsent(consent).grants.some((grant) => grants(grant, provider, host));
}

/** The record under today's disclosure (`currentConsent`) without this grant: a revoke. */
export function withoutGrant(consent: Consent | null, provider: ProviderId, host: string): Consent {
  const current = currentConsent(consent);
  return { ...current, grants: current.grants.filter((grant) => !grants(grant, provider, host)) };
}

/** The record under today's disclosure (`currentConsent`) with this grant added, or its time refreshed. */
export function withGrant(consent: Consent | null, provider: ProviderId, host: string, at: Date): Consent {
  const others = withoutGrant(consent, provider, host).grants;
  const grant = { provider, host: host.toLowerCase(), at: at.toISOString() };
  return { v: 1, disclosure: DISCLOSURE_HASH, grants: [...others, grant] };
}

/**
 * Why `provider` at `host` may not be sent to: the disclosure changed since consent was given, or no grant is on
 * file. Both the route check and `approve` say it this way.
 */
export function consentMissing(consent: Consent | null, provider: ProviderId, host: string): string {
  const grant = `${provider} at ${host}`;
  return consent && consent.disclosure !== DISCLOSURE_HASH
    ? `the disclosure changed since consent was given: a human runs \`refsure setup\` again to grant ${grant}`
    : `no consent grant for ${grant}: a human runs \`refsure setup\` in a terminal`;
}
