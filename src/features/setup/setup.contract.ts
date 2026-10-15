import type { SetupGrant } from './setup-grant';

/** `refsure setup`: every host asked about, where the consent record lives, and the disclosure it was given for. */
export interface SetupResult {
  grants: SetupGrant[];
  consent: string;
  disclosure_hash: string;
  /** Hosts not asked: the run ended or was interrupted first. Their grants on file are unchanged. */
  unanswered: string[];
}
