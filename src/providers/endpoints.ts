import type { GatewayConfig } from '../config';
import type { ProviderId } from '../questions';
import type { Endpoint } from './endpoint';

/** Jev through OpenRouter's `systemone` route (spec §7.1). */
export const JEV_OPENROUTER: Endpoint = Object.freeze({
  provider: 'jev',
  url: 'https://openrouter.ai/api/v1/systemone',
  host: 'openrouter.ai',
  model: 'jev-1.13',
  key: 'openrouter',
  headers: Object.freeze({}),
});

/** OpenAI Decisions, called directly (spec §7.1). */
export const OPENAI_DIRECT: Endpoint = Object.freeze({
  provider: 'openai',
  url: 'https://api.openai.com/v1/decisions',
  host: 'api.openai.com',
  model: 'gpt-6-luna',
  key: 'openai',
  headers: Object.freeze({}),
});

const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
/** refsure sets these itself; a gateway header of the same name would split or replace them. */
const RESERVED_HEADERS: ReadonlySet<string> = new Set(['authorization', 'content-type', 'content-length', 'host']);

/** Whether the gateway config names both the path and the model for this provider. No defaults exist. */
export function gatewayNames(cfg: GatewayConfig | null, provider: ProviderId): boolean {
  if (!cfg) return false;
  return provider === 'jev'
    ? nonEmpty(cfg.jevPath) && nonEmpty(cfg.jevModel)
    : nonEmpty(cfg.openaiPath) && nonEmpty(cfg.openaiModel);
}

/**
 * The gateway's endpoints: one per provider whose path and model the config both names. The URL must be
 * `https:` unless the host is loopback, and carry no credentials; a gateway that fails that yields nothing.
 */
export function gatewayEndpoints(cfg: GatewayConfig | null): Partial<Record<ProviderId, Endpoint>> {
  const out: Partial<Record<ProviderId, Endpoint>> = {};
  if (!cfg) return out;
  if (gatewayNames(cfg, 'jev')) {
    const endpoint = gatewayEndpoint(cfg, 'jev', cfg.jevPath!, cfg.jevModel!);
    if (endpoint) out.jev = endpoint;
  }
  if (gatewayNames(cfg, 'openai')) {
    const endpoint = gatewayEndpoint(cfg, 'openai', cfg.openaiPath!, cfg.openaiModel!);
    if (endpoint) out.openai = endpoint;
  }
  return out;
}

/**
 * The endpoint a provider's Decisions go to. A gateway that names the provider replaces the direct one;
 * a gateway that names it but cannot be used gives `null`, never a silent switch to another host.
 */
export function endpointFor(provider: ProviderId, cfg: GatewayConfig | null): Endpoint | null {
  if (gatewayNames(cfg, provider)) return gatewayEndpoints(cfg)[provider] ?? null;
  return provider === 'jev' ? JEV_OPENROUTER : OPENAI_DIRECT;
}

/** `https:`, or `http:` on a loopback host only. */
export function isSecureUrl(url: URL): boolean {
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
}

function gatewayEndpoint(cfg: GatewayConfig, provider: ProviderId, path: string, model: string): Endpoint | null {
  let url: URL;
  try {
    url = new URL(`${cfg.url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  } catch {
    return null;
  }
  if (!isSecureUrl(url) || url.username !== '' || url.password !== '') return null;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(cfg.headers ?? {})) {
    if (typeof value === 'string' && !RESERVED_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return Object.freeze({
    provider,
    url: url.href,
    host: url.host,
    model,
    key: 'gateway',
    headers: Object.freeze(headers),
  });
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
