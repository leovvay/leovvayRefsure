import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { ConfigError } from './config-error';
import { isRecord, POSIX_MODES } from '../shared';
import {
  checkGatewayUrl, invalid, onlyFields, readBoolean, readGateway, readKeySpec, readLimits, readOrigins,
} from './config-fields';
import type { GatewayConfig, RefsureConfig } from './config-types';
import { resolvePaths } from './paths';

const KEY_NAMES = ['openrouter', 'openai', 'gateway'] as const;
const TOP_FIELDS = new Set([
  '$schema', 'keys', 'gateway', 'allowOrigins', 'denyOrigins', 'piiMasks', 'requireIsolatedProfile', 'limits',
]);

// OPENROUTER_API_KEY / OPENAI_API_KEY are never read unless the file names them (spec §7.2).
function defaultKeys(): RefsureConfig['keys'] {
  return {
    openrouter: { env: 'REFSURE_OPENROUTER_KEY' },
    openai: { env: 'REFSURE_OPENAI_KEY' },
    gateway: { env: 'REFSURE_GATEWAY_KEY' },
  };
}

/** `REFSURE_GATEWAY_URL`, trimmed; unset or blank reads as none. */
function envGatewayUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.REFSURE_GATEWAY_URL?.trim() || undefined;
}

// With no `gateway` object in the file, the env URL alone names a gateway that routes nothing: no path is named.
function envGateway(env: NodeJS.ProcessEnv): GatewayConfig | null {
  const url = envGatewayUrl(env);
  if (url === undefined) return null;
  checkGatewayUrl('REFSURE_GATEWAY_URL', url);
  return { url };
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

/** The parsed file, or `null` when there is none. One descriptor, so the mode checked is the file read. */
function readConfigFile(path: string): Record<string, unknown> | null {
  let fd: number;
  try {
    // Non-blocking, so a FIFO here cannot hang the open; the fstat below refuses anything but a regular file.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    invalid(`cannot open ${path} (${code ?? 'error'})`);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) invalid(`${path} is not a regular file`);
    if (POSIX_MODES && (stat.mode & 0o077) !== 0) {
      const mode = (stat.mode & 0o777).toString(8).padStart(4, '0');
      throw new ConfigError('config_mode', `${path} has mode ${mode}; run chmod 600 ${path}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(fd, 'utf8'));
    } catch {
      invalid(`${path} is not valid JSON`);
    }
    if (!isRecord(parsed)) invalid(`${path} must hold a JSON object`);
    return parsed;
  } finally {
    closeSync(fd);
  }
}

function readKeys(value: unknown): RefsureConfig['keys'] {
  const keys = defaultKeys();
  if (value === undefined) return keys;
  if (!isRecord(value)) invalid('keys must be an object');
  onlyFields('keys', value, new Set(KEY_NAMES));
  for (const name of KEY_NAMES) {
    if (value[name] !== undefined) keys[name] = readKeySpec(name, value[name]);
  }
  return keys;
}

/**
 * The config from `$XDG_CONFIG_HOME/refsure/config.json`, or the defaults when there is no file.
 * Throws `ConfigError`; the registry maps it to `not_set_up` with the error's cause.
 */
export function loadConfig(env: NodeJS.ProcessEnv): RefsureConfig {
  const paths = resolvePaths(env);
  const limits = { decisionsPerMinute: 30, usdPerDay: 0.5 };
  // No file reads as an empty one: every default below lives in one place.
  const file: Record<string, unknown> = readConfigFile(paths.config) ?? {};
  onlyFields('config', file, TOP_FIELDS);
  return {
    keys: readKeys(file.keys),
    gateway: file.gateway === undefined ? envGateway(env) : readGateway(file.gateway, envGatewayUrl(env)),
    allowOrigins: file.allowOrigins === undefined ? [] : readOrigins('allowOrigins', file.allowOrigins),
    denyOrigins: file.denyOrigins === undefined ? [] : readOrigins('denyOrigins', file.denyOrigins),
    piiMasks: file.piiMasks === undefined ? true : readBoolean('piiMasks', file.piiMasks),
    requireIsolatedProfile: file.requireIsolatedProfile === undefined
      ? false
      : readBoolean('requireIsolatedProfile', file.requireIsolatedProfile),
    limits: file.limits === undefined ? limits : readLimits(file.limits, limits),
    paths,
  };
}
