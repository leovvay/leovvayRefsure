import type { ProviderId } from '../questions';

/** `at` is an ISO 8601 time. A grant counts only under the disclosure hash it was given for. */
export interface ConsentGrant { provider: ProviderId; host: string; at: string }

/** `$XDG_CONFIG_HOME/refsure/consent.json`, mode 0600 (spec §8.6). */
export interface Consent { v: 1; disclosure: string; grants: ConsentGrant[] }
