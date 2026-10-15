import { closeSync, fstatSync, openSync, readFileSync } from 'node:fs';
import type { ProviderId } from '../questions';
import type { Consent, ConsentGrant } from './consent-record';
import { DISCLOSURE_HASH } from './disclosure';
import { writePrivateFile } from './private-file';

const PROVIDERS: ReadonlySet<string> = new Set(['jev', 'openai']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asGrant(value: unknown): ConsentGrant | null {
  if (!isRecord(value)) return null;
  const { provider, host, at } = value;
  if (typeof provider !== 'string' || !PROVIDERS.has(provider)) return null;
  if (typeof host !== 'string' || host === '' || typeof at !== 'string') return null;
  return { provider: provider as ProviderId, host, at };
}

/**
 * The consent record, or `null` when it is missing, unreadable, not a v1 record, or writable by anyone but
 * its owner (someone else could then grant on the owner's behalf). A malformed grant is dropped, not trusted.
 */
export function readConsent(path: string): Consent | null {
  let fd: number;
  try {
    fd = openSync(path, 'r');
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

/** True only when the record was given for today's disclosure and holds this provider at this host. */
export function grantFor(consent: Consent | null, provider: ProviderId, host: string): boolean {
  if (!consent || consent.disclosure !== DISCLOSURE_HASH) return false;
  const wanted = host.toLowerCase();
  return consent.grants.some((grant) => grant.provider === provider && grant.host.toLowerCase() === wanted);
}

/**
 * The record with this grant added (or its time refreshed), under today's disclosure. Grants given for an
 * older disclosure are dropped: the human has not read this one for them.
 */
export function withGrant(consent: Consent | null, provider: ProviderId, host: string, at: Date): Consent {
  const kept = consent && consent.disclosure === DISCLOSURE_HASH ? consent.grants : [];
  const wanted = host.toLowerCase();
  const others = kept.filter((grant) => !(grant.provider === provider && grant.host.toLowerCase() === wanted));
  return { v: 1, disclosure: DISCLOSURE_HASH, grants: [...others, { provider, host: wanted, at: at.toISOString() }] };
}
