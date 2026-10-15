import type { ProviderId } from '../../questions';

/** `refsure setup --dry-run`: the hosts it would ask about and the phrase for each; nothing asked or written. */
export interface SetupPreview {
  dry_run: true;
  would_ask: { provider: ProviderId; host: string; phrase: string }[];
  disclosure_hash: string;
}
