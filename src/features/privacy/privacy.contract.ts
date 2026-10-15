import type { ConsentGrant } from '../../egress';
import type { ProviderId } from '../../questions';
import type { PrivacyProvider } from './privacy-provider';

/**
 * `refsure privacy`: the disclosure a human grants under, the grants on file, and where page text can go. While the
 * config file is refused, `config.refused` says why, nothing leaves, and the fields the file would set are null.
 */
export interface PrivacyResult {
  disclosure: string;
  hash: string;
  /** The grants on file; they count only while `consent_current` is true. */
  grants: ConsentGrant[];
  /** The grants were given for this disclosure text; false means `refsure setup` must run again. */
  consent_current: boolean;
  providers: Record<ProviderId, PrivacyProvider>;
  pii_masks: boolean | null;
  allow_origins: string[] | null;
  deny_origins: string[] | null;
  require_isolated_profile: boolean | null;
  /** Times, sizes and digests of every call; never content. */
  egress_log: string;
  config: { path: string; refused: { cause: string; detail: string } | null };
}
