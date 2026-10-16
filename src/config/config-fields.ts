import { ConfigError } from './config-error';
import type { GatewayConfig, KeySpec, RefsureConfig } from './config-types';
import { parseOriginPattern } from './origin-pattern';
import { isRecord } from '../shared';

// Details never quote a value from the file: a mistyped key spec may hold the key itself.

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// A header that carries a credential belongs in a key source, never in the file.
const CREDENTIAL_HEADER = /^(authorization|proxy-authorization|cookie)$|key|token|secret|passw|auth/i;
const GATEWAY_FIELDS = new Set(['url', 'jevPath', 'jevModel', 'openaiPath', 'openaiModel', 'headers']);
const GATEWAY_TEXT_FIELDS = ['jevPath', 'jevModel', 'openaiPath', 'openaiModel'] as const;

export function invalid(detail: string): never {
  throw new ConfigError('config_invalid', detail);
}

export function onlyFields(where: string, value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) invalid(`${where}.${field} is not a known field`);
  }
}

export function readKeySpec(name: string, value: unknown): KeySpec | null {
  if (value === null) return null;
  if (typeof value === 'string') {
    throw new ConfigError(
      'literal_key',
      `keys.${name} is a string; name an env variable ({"env":"NAME"}) or a command ({"command":["argv0","arg"]})`,
    );
  }
  if (!isRecord(value)) invalid(`keys.${name} must be null, {"env":"NAME"} or {"command":[...]}`);
  const extra = Object.keys(value).filter((field) => field !== 'env' && field !== 'command');
  if (extra.length > 0) {
    throw new ConfigError('literal_key', `keys.${name} has field(s) ${extra.join(', ')}; only "env" or "command" is accepted`);
  }
  if ('env' in value && 'command' in value) invalid(`keys.${name} names both "env" and "command"; keep one`);
  if ('env' in value) {
    if (typeof value.env !== 'string') invalid(`keys.${name}.env must be a string`);
    if (!ENV_NAME.test(value.env)) {
      throw new ConfigError('literal_key', `keys.${name}.env must be an environment variable name, not a value`);
    }
    return { env: value.env };
  }
  const command = value.command;
  if (!Array.isArray(command) || command.length === 0 || !command.every((arg) => typeof arg === 'string' && arg !== '')) {
    invalid(`keys.${name}.command must be a non-empty array of non-empty strings`);
  }
  return { command: [...(command as string[])] };
}

/**
 * A loopback host, as `URL.hostname` spells it: `localhost` and `*.localhost`, `127.0.0.0/8`, `[::1]`. The config
 * check and the provider endpoints both read it, so a gateway the config accepts is one the providers use.
 */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || hostname === '::1'
    || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/** https anywhere, http only on loopback; never credentials or a query in the URL itself. */
export function checkGatewayUrl(where: string, url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    invalid(`${where} is not a URL`);
  }
  if (parsed.username || parsed.password || parsed.search) {
    throw new ConfigError('literal_key', `${where} carries credentials or a query; put the key in keys.gateway`);
  }
  if (parsed.hash) invalid(`${where} must not carry a fragment`);
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return;
  throw new ConfigError('gateway_insecure', `${where} must be https, or http on localhost`);
}

/**
 * The file's `gateway` object (spec §7.1). Its URL is `gateway.url`, else `REFSURE_GATEWAY_URL` (`envUrl`): the file's
 * own URL wins. Paths, models and headers come only from the file.
 */
export function readGateway(value: unknown, envUrl?: string): GatewayConfig | null {
  if (value === null) return null;
  if (!isRecord(value)) invalid('gateway must be null or an object');
  onlyFields('gateway', value, GATEWAY_FIELDS);
  let url: string;
  if (value.url === undefined && envUrl !== undefined) {
    checkGatewayUrl('REFSURE_GATEWAY_URL', envUrl);
    url = envUrl;
  } else {
    if (typeof value.url !== 'string') invalid('gateway.url must be a string, or set REFSURE_GATEWAY_URL');
    checkGatewayUrl('gateway.url', value.url);
    url = value.url;
  }
  const gateway: GatewayConfig = { url };
  for (const field of GATEWAY_TEXT_FIELDS) {
    const text = value[field];
    if (text === undefined) continue;
    if (typeof text !== 'string' || text.trim() === '') invalid(`gateway.${field} must be a non-empty string`);
    if (field.endsWith('Path') && !text.startsWith('/')) invalid(`gateway.${field} must start with "/"`);
    gateway[field] = text;
  }
  if (value.headers !== undefined) gateway.headers = readHeaders(value.headers);
  return gateway;
}

function readHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) invalid('gateway.headers must be an object of strings');
  const headers: Record<string, string> = {};
  for (const [name, text] of Object.entries(value)) {
    if (!HEADER_NAME.test(name)) invalid('gateway.headers has a name that is not a valid header name');
    if (CREDENTIAL_HEADER.test(name)) {
      throw new ConfigError('literal_key', `gateway.headers.${name} looks like a credential; put the key in keys.gateway`);
    }
    if (typeof text !== 'string' || /[\r\n]/.test(text)) invalid(`gateway.headers.${name} must be a one-line string`);
    headers[name] = text;
  }
  return headers;
}

export function readOrigins(where: string, value: unknown): string[] {
  if (!Array.isArray(value)) invalid(`${where} must be an array of origins`);
  return value.map((entry: unknown, index) => {
    if (typeof entry !== 'string' || !parseOriginPattern(entry)) {
      invalid(`${where}[${index}] is not an origin like https://example.com or https://*.example.com`);
    }
    return entry.trim();
  });
}

export function readBoolean(where: string, value: unknown): boolean {
  if (typeof value !== 'boolean') invalid(`${where} must be true or false`);
  return value;
}

export function readLimits(value: unknown, defaults: RefsureConfig['limits']): RefsureConfig['limits'] {
  if (!isRecord(value)) invalid('limits must be an object');
  onlyFields('limits', value, new Set(['decisionsPerMinute', 'usdPerDay']));
  const { decisionsPerMinute = defaults.decisionsPerMinute, usdPerDay = defaults.usdPerDay } = value;
  if (typeof decisionsPerMinute !== 'number' || !Number.isInteger(decisionsPerMinute) || decisionsPerMinute < 0) {
    invalid('limits.decisionsPerMinute must be a whole number ≥ 0');
  }
  if (typeof usdPerDay !== 'number' || !Number.isFinite(usdPerDay) || usdPerDay < 0) {
    invalid('limits.usdPerDay must be a number ≥ 0');
  }
  return { decisionsPerMinute, usdPerDay };
}
