import type { ProviderId } from '../../questions';

/** One host `setup` asked about, and whether the human typed the phrase for it. */
export interface SetupGrant { provider: ProviderId; host: string; granted: boolean }
