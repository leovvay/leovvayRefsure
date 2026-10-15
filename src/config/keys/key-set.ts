import type { KeySpec, RefsureConfig } from '../config-types';
import { commandKey } from './command-key';
import { envKey } from './env-key';
import type { KeySet } from './key-set-type';
import type { KeySource } from './key-source';

function sourceFor(spec: KeySpec | null, env: NodeJS.ProcessEnv): KeySource | null {
  if (!spec) return null;
  return 'env' in spec ? envKey(spec.env, env) : commandKey(spec.command);
}

/** Builds the sources only; nothing is read until a provider asks. */
export function keySet(config: RefsureConfig, env: NodeJS.ProcessEnv): KeySet {
  return {
    openrouter: sourceFor(config.keys.openrouter, env),
    openai: sourceFor(config.keys.openai, env),
    gateway: sourceFor(config.keys.gateway, env),
  };
}
