import type { ConsentGrant } from '../../egress';
import type { ProviderId } from '../../questions';
import type { PrivacyProvider } from './privacy-provider';

/** `refsure privacy`: the disclosure a human grants under, the grants on file, and where page text can go. */
export interface PrivacyResult {
  disclosure: string;
  hash: string;
  /** The grants on file; they count only while `consent_current` is true. */
  grants: ConsentGrant[];
  /** The grants were given for this disclosure text; false means `refsure setup` must run again. */
  consent_current: boolean;
  providers: Record<ProviderId, PrivacyProvider>;
  pii_masks: boolean;
  allow_origins: string[];
  deny_origins: string[];
  require_isolated_profile: boolean;
  /** Times, sizes and digests of every call; never content. */
  egress_log: string;
}
