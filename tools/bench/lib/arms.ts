import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { keySet } from '../../../src/config';
import type { GatewayConfig, RefsureConfig } from '../../../src/config';
import { providerRoster } from '../../../src/providers';
import type { Endpoint, Rendering } from '../../../src/providers';
import { familyOf, KNOWN_FAMILIES } from '../../../src/questions';
import type { ProviderId } from '../../../src/questions';

/*
  The arms file (`REFSURE_BENCH_ARMS`, outside every repo): one refsure gateway block, then one entry per arm with
  its provider, route, model, rendering and the NAME of the env variable that holds its key. Endpoints, key names,
  spend-tag headers and private terms live only there; this directory never names one. Nothing here reads a key.
*/

/** `gateway`: refsure's gateway endpoint from the file's `gateway` block; `direct`: refsure's default endpoint. */
export type ArmVia = 'gateway' | 'direct';

/** Which sets an arm may receive: `public` arms never get an item that holds a private term (X4). */
export type ArmData = 'all' | 'public';

export interface Arm {
  id: string;
  provider: ProviderId;
  via: ArmVia;
  /** For `direct`: the URL refsure's default endpoint must resolve to (checked, never used to build one). */
  url?: string;
  /** The model the arm sends, exactly as refsure's endpoint names it. */
  model: string;
  /** `none` for Jev (state as a JSON object); an OpenAI rendering otherwise. */
  rendering: 'none' | Rendering;
  keyEnv: string;
  data: ArmData;
  /** Added by the bench fetch wrapper to every request of this arm (spend attribution); never body fields. */
  extraHeaders: Readonly<Record<string, string>>;
}

export interface ArmsFile {
  v: 1;
  gateway: GatewayConfig | null;
  /** Path under the gateway URL that returns the bench key's own spend (read-only), when it is readable. */
  keyInfoPath: string | null;
  /** Response headers copied into each attempt (lower case): cache hits, gateway version, reported cost. */
  recordHeaders: readonly string[];
  /** Per host, a URL for the RTT baseline (4.3). */
  rttUrls: Readonly<Record<string, string>>;
  /** Case-insensitive substrings that keep an item off `public` arms (X4). */
  privateTerms: readonly string[];
  arms: readonly Arm[];
  /** sha256 of the file's bytes, recorded on every row as `arms_sha`. */
  sha: string;
  path: string;
}

const RESERVED_HEADERS = new Set(['authorization', 'content-type', 'content-length', 'host']);
const CREDENTIAL_PARAM = /(key|token|secret|auth|password|sig)/i;
/** A key-shaped string: a prefixed key, or any long unbroken token run. */
const KEY_SHAPED = /(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,}/;

/** Throws when a value looks like it holds a key; never echoes the value. */
export function refuseKeyShaped(where: string, value: string): void {
  if (KEY_SHAPED.test(value)) throw new Error(`${where}: holds a key-shaped string (a key belongs in env, named by keyEnv)`);
}

/**
 * Throws when a URL carries credentials: user info, a query parameter named like one, or a key-shaped path
 * segment, query value or fragment.
 */
export function refuseCredentialUrl(where: string, raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${where}: not a URL`);
  }
  if (url.username !== '' || url.password !== '') throw new Error(`${where}: the URL carries credentials`);
  for (const name of url.searchParams.keys()) {
    if (CREDENTIAL_PARAM.test(name)) throw new Error(`${where}: the URL carries a credential-like query parameter`);
  }
  const decode = (text: string) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };
  for (const segment of url.pathname.split('/')) refuseKeyShaped(`${where} (path)`, decode(segment));
  for (const value of url.searchParams.values()) refuseKeyShaped(`${where} (query)`, value);
  refuseKeyShaped(`${where} (fragment)`, decode(url.hash));
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error(`${where}: the URL is not https (or loopback)`);
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where}: expected a non-empty string`);
  return value;
}

function headersOf(value: unknown, where: string): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where}: expected an object`);
  const out: Record<string, string> = {};
  for (const [name, header] of Object.entries(value)) {
    if (RESERVED_HEADERS.has(name.toLowerCase())) throw new Error(`${where}.${name}: refsure sets this header itself`);
    out[name.toLowerCase()] = str(header, `${where}.${name}`);
    refuseKeyShaped(`${where}.${name}`, header as string);
  }
  return out;
}

function armOf(raw: unknown, index: number): Omit<Arm, 'url'> & { url?: string } {
  const where = `arms[${index}]`;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: expected an object`);
  const a = raw as Record<string, unknown>;
  const provider = str(a.provider, `${where}.provider`);
  if (provider !== 'jev' && provider !== 'openai') throw new Error(`${where}.provider: jev or openai`);
  const via = str(a.via, `${where}.via`);
  if (via !== 'gateway' && via !== 'direct') throw new Error(`${where}.via: gateway or direct`);
  const rendering = str(a.rendering, `${where}.rendering`);
  const renderings = provider === 'jev' ? ['none'] : ['o_primary', 'o_s2'];
  if (!renderings.includes(rendering)) throw new Error(`${where}.rendering: ${renderings.join(' or ')} for ${provider}`);
  const data = a.data === undefined ? 'all' : str(a.data, `${where}.data`);
  if (data !== 'all' && data !== 'public') throw new Error(`${where}.data: all or public`);
  const keyEnv = str(a.keyEnv, `${where}.keyEnv`);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(keyEnv)) throw new Error(`${where}.keyEnv: an env variable NAME, never a key`);
  const url = a.url === undefined ? undefined : str(a.url, `${where}.url`);
  if (url !== undefined) refuseCredentialUrl(`${where}.url`, url);
  return {
    id: str(a.id, `${where}.id`), provider, via, model: str(a.model, `${where}.model`), rendering: rendering as Arm['rendering'],
    keyEnv, data, extraHeaders: headersOf(a.extraHeaders, `${where}.extraHeaders`), ...(url === undefined ? {} : { url }),
  };
}

/** Reads and validates the arms file at `path` (default `$REFSURE_BENCH_ARMS`); throws with the first problem. */
export function readArmsFile(path = process.env.REFSURE_BENCH_ARMS): ArmsFile {
  if (path === undefined || path === '') throw new Error('REFSURE_BENCH_ARMS is not set: point it at the arms file');
  const bytes = readFileSync(path);
  const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  if (raw.v !== 1) throw new Error(`${path}: v must be 1`);
  const gateway = (raw.gateway ?? null) as GatewayConfig | null;
  if (gateway !== null) {
    refuseCredentialUrl('gateway.url', str(gateway.url, 'gateway.url'));
    headersOf(gateway.headers, 'gateway.headers');
  }
  const rttUrls = (raw.rttUrls ?? {}) as Record<string, string>;
  for (const [host, url] of Object.entries(rttUrls)) refuseCredentialUrl(`rttUrls.${host}`, url);
  if (!Array.isArray(raw.arms) || raw.arms.length === 0) throw new Error(`${path}: arms must be a non-empty list`);
  const arms = raw.arms.map(armOf);
  const ids = new Set<string>();
  for (const arm of arms) {
    if (ids.has(arm.id)) throw new Error(`${path}: arm ${arm.id} appears twice`);
    ids.add(arm.id);
    if (arm.via === 'gateway' && gateway === null) throw new Error(`${arm.id}: via gateway, but the file has no gateway block`);
  }
  const strings = (value: unknown) => (Array.isArray(value) ? value.map((v, i) => str(v, `list[${i}]`)) : []);
  return {
    v: 1, gateway, arms, rttUrls,
    keyInfoPath: typeof raw.keyInfoPath === 'string' ? raw.keyInfoPath : null,
    recordHeaders: strings(raw.recordHeaders).map((name) => name.toLowerCase()),
    privateTerms: strings(raw.privateTerms).map((term) => term.toLowerCase()),
    sha: createHash('sha256').update(bytes).digest('hex'),
    path,
  };
}

/** The arm by id, or a thrown error naming the ids the file has. */
export function armById(file: ArmsFile, id: string): Arm {
  const arm = file.arms.find((candidate) => candidate.id === id);
  if (!arm) throw new Error(`no arm ${id} in the arms file (it has ${file.arms.map((a) => a.id).join(', ')})`);
  return arm;
}

/** Whether `text` holds a private term (X4): such an item is never sent on a `public` arm. */
export function holdsPrivateTerm(file: ArmsFile, text: string): boolean {
  const folded = text.toLowerCase();
  return file.privateTerms.some((term) => folded.includes(term));
}

/**
 * The refsure config one arm runs under: only this arm's key slot is set (by env NAME), the gateway block only for
 * `via: gateway`, PII masks as given, caps far out of reach (the bench is not a command), and every path inside
 * `stateDir`, where the bench writes its own consent grant.
 */
export function armConfig(file: ArmsFile, arm: Arm, stateDir: string, piiMasks = true): RefsureConfig {
  const spec = { env: arm.keyEnv };
  const direct = arm.via === 'direct';
  return {
    keys: {
      openrouter: direct && arm.provider === 'jev' ? spec : null,
      openai: direct && arm.provider === 'openai' ? spec : null,
      gateway: direct ? null : spec,
    },
    gateway: direct ? null : file.gateway,
    allowOrigins: [],
    denyOrigins: [],
    piiMasks,
    requireIsolatedProfile: false,
    limits: { decisionsPerMinute: 1_000_000, usdPerDay: 1_000_000 },
    paths: {
      config: join(stateDir, 'config.json'),
      consent: join(stateDir, 'consent.json'),
      state: stateDir,
      egressLog: join(stateDir, 'egress.log'),
    },
  };
}

/**
 * The endpoint refsure resolves for this arm, checked against the file: the model sent equals `arm.model`, and a
 * `direct` arm's URL equals refsure's default endpoint. Throws on any mismatch; reads no key.
 */
export function armEndpoint(file: ArmsFile, arm: Arm): Endpoint {
  const config = armConfig(file, arm, '/nonexistent');
  const slot = providerRoster(config, keySet(config, {}))[arm.provider];
  if (!slot.endpoint) throw new Error(`${arm.id}: refsure resolves no endpoint (${slot.problem ?? 'unknown'})`);
  if (familyOf(arm.model) !== familyOf(KNOWN_FAMILIES[arm.provider])) {
    throw new Error(`${arm.id}: model ${arm.model} is not the pinned ${KNOWN_FAMILIES[arm.provider]} family (2.2)`);
  }
  if (slot.endpoint.model !== arm.model) {
    throw new Error(`${arm.id}: refsure would send model ${slot.endpoint.model}, the arm names ${arm.model}`);
  }
  if (arm.via === 'direct' && arm.url !== undefined && slot.endpoint.url !== arm.url) {
    throw new Error(`${arm.id}: refsure's default endpoint is not the arm's url`);
  }
  if (arm.via === 'gateway' && slot.endpoint.key !== 'gateway') throw new Error(`${arm.id}: not routed through the gateway`);
  return slot.endpoint;
}
