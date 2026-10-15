import type { CommandContext } from '../../cli';
import { type ConfigError, isConfigError, keySet, type RefsureConfig } from '../../config';
import { providerRoster, type ProviderSlot } from '../../providers';
import type { ProviderId } from '../../questions';

/**
 * The config, or the `ConfigError` refsure refused the file with, for a verb that still answers on a refused
 * config (doctor, privacy). Any other failure propagates.
 */
export function readConfig(ctx: CommandContext): { config: RefsureConfig } | { refused: ConfigError } {
  try {
    return { config: ctx.config };
  } catch (error) {
    if (!isConfigError(error)) throw error;
    return { refused: error };
  }
}

/** Every provider as this config and environment set it up (`providerRoster`); no key is read. */
export function rosterOf(config: RefsureConfig, env: NodeJS.ProcessEnv): Readonly<Record<ProviderId, ProviderSlot>> {
  return providerRoster(config, keySet(config, env));
}
