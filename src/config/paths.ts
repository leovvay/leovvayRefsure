import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { RefsureConfig } from './config-types';

// The XDG spec says a relative value is invalid and must be ignored.
function xdgDir(env: NodeJS.ProcessEnv, name: string, fallback: string[]): string {
  const value = env[name];
  if (value && isAbsolute(value)) return value;
  const home = env.HOME && isAbsolute(env.HOME) ? env.HOME : homedir();
  return join(home, ...fallback);
}

/** Where refsure keeps its files. Pure: directories are created 0700 by whoever writes into them. */
export function resolvePaths(env: NodeJS.ProcessEnv): RefsureConfig['paths'] {
  const configDir = join(xdgDir(env, 'XDG_CONFIG_HOME', ['.config']), 'refsure');
  const stateDir = join(xdgDir(env, 'XDG_STATE_HOME', ['.local', 'state']), 'refsure');
  return {
    config: join(configDir, 'config.json'),
    consent: join(configDir, 'consent.json'),
    state: stateDir,
    egressLog: join(stateDir, 'egress.log'),
  };
}
