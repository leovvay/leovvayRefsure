import type { KeySource } from './key-source';

/** Reads `env[name]` at call time, so the value is only in memory for the request that needs it. */
export function envKey(name: string, env: NodeJS.ProcessEnv): KeySource {
  return {
    kind: 'env',
    label: name,
    read: async () => {
      const value = env[name]?.trim();
      return value ? value : null;
    },
  };
}
