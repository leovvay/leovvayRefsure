import { loadConfig } from './load-config';
import type { RefsureConfig } from './config-types';

/**
 * The config, loaded on first use and remembered, its `ConfigError` too. A command that never reads the config
 * (`commands`, `causes`, `--help`) runs on a broken file; one that does gets the same refusal every time.
 */
export function configOnce(env: NodeJS.ProcessEnv): () => RefsureConfig {
  let loaded: { config: RefsureConfig } | { error: unknown } | null = null;
  return () => {
    if (loaded === null) {
      try {
        loaded = { config: loadConfig(env) };
      } catch (error) {
        loaded = { error };
      }
    }
    if ('error' in loaded) throw loaded.error;
    return loaded.config;
  };
}
