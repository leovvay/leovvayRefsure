import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCredentialUrl } from '../lib/arms';
import { CFGS } from './scenario';
import type { Backend, CfgId } from './scenario';

/*
  The four CLI configurations of protocol 6.3, one XDG pair each, outside both repos. The cfgs file (also outside
  both repos, path in --cfgs) names where the pairs live and, per cfg, how its key reaches one `refsure` process:
  `keyWrap` is the secret store's wrapper (argv before the command, e.g. a `... run NAME --` form) and `keyExport`
  maps refsure's own env name to the name the wrapper sets. No key value ever passes through this file or the bench.

    { "v": 1, "root": "<dir holding xdg-<cfg>[-ab]>", "fixtureOrigin": "http://127.0.0.1:8767",
      "cfgs": { "cli_both": { "keyWrap": ["<store>", "run", "<NAME>", "--"], "keyExport": { "REFSURE_GATEWAY_KEY": "<NAME>" } },
                "cli_jev": {...}, "cli_jevor": {...}, "cli_oa": {...} } }

  `setupCfgs` writes each config.json (mode 0600) from the owner's gateway config and copies the owner-granted
  consent.json; it never writes a consent grant of its own. agent-browser runs use `<cfg>-ab` copies that differ
  only by `requireIsolatedProfile: false` (6.2).
*/

export interface CfgSpec { keyWrap: string[]; keyExport: Readonly<Record<string, string>> }
export interface CfgsFile { root: string; fixtureOrigin: string; cfgs: Readonly<Record<CfgId, CfgSpec>> }

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const REFSURE_KEY_ENV = /^REFSURE_[A-Z0-9_]+_KEY$/;

export function readCfgsFile(path: string): CfgsFile {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { v?: number; root?: unknown; fixtureOrigin?: unknown; cfgs?: Record<string, Partial<CfgSpec>> };
  if (raw.v !== 1) throw new Error(`${path}: v must be 1`);
  if (typeof raw.root !== 'string' || raw.root === '') throw new Error(`${path}: root is required`);
  const fixtureOrigin = typeof raw.fixtureOrigin === 'string' ? raw.fixtureOrigin : 'http://127.0.0.1:8767';
  const cfgs = {} as Record<CfgId, CfgSpec>;
  for (const id of CFGS) {
    const spec = raw.cfgs?.[id];
    if (spec === undefined) throw new Error(`${path}: cfgs.${id} is missing`);
    const keyWrap = spec.keyWrap ?? [];
    if (!Array.isArray(keyWrap) || keyWrap.some((w) => typeof w !== 'string')) throw new Error(`${path}: cfgs.${id}.keyWrap must be strings`);
    const keyExport = spec.keyExport ?? {};
    for (const [to, from] of Object.entries(keyExport)) {
      if (!REFSURE_KEY_ENV.test(to) || typeof from !== 'string' || !ENV_NAME.test(from)) {
        throw new Error(`${path}: cfgs.${id}.keyExport must map REFSURE_*_KEY names to env names`);
      }
    }
    cfgs[id] = { keyWrap, keyExport };
  }
  return { root: raw.root, fixtureOrigin, cfgs };
}

/** The XDG pair of a cfg on a backend (`-ab` copies for agent-browser). */
export function xdgOf(file: CfgsFile, cfg: CfgId, backend: Backend): { config: string; state: string; dir: string } {
  const dir = join(file.root, `xdg-${cfg}${backend === 'agent-browser' ? '-ab' : ''}`);
  return { dir, config: join(dir, 'config'), state: join(dir, 'state') };
}

/**
 * The argv and env of one `refsure` command: no inherited `REFSURE_*` (a stray key, gateway URL or backend would
 * change the route), nor any name a wrapper exports; the cfg's XDG pair and the backend set explicitly.
 */
export function commandFor(file: CfgsFile, cfg: CfgId, backend: Backend, dist: string, argv: readonly string[]): { argv: string[]; env: NodeJS.ProcessEnv } {
  const spec = file.cfgs[cfg];
  const sources = new Set(Object.values(spec.keyExport));
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('REFSURE_') && !sources.has(name) && !name.startsWith('AGENT_BROWSER_')) env[name] = value;
  }
  const xdg = xdgOf(file, cfg, backend);
  Object.assign(env, { XDG_CONFIG_HOME: xdg.config, XDG_STATE_HOME: xdg.state, REFSURE_BACKEND: backend });
  let inner = [process.execPath, dist, ...argv];
  const exports = Object.entries(spec.keyExport);
  if (exports.length > 0) {
    const script = `${exports.map(([to, from]) => `export ${to}="$${from}"; unset ${from};`).join(' ')} exec "$@"`;
    inner = ['/bin/sh', '-c', script, 'refsure-bench', ...inner];
  }
  return { argv: [...spec.keyWrap, ...inner], env };
}

interface SourceConfig { keys?: Record<string, unknown>; gateway?: Record<string, unknown> }

function pick(obj: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.filter((n) => obj[n] !== undefined).map((n) => [n, obj[n]]));
}

/** 6.3 per cfg: which gateway fields it keeps (null = no gateway block) and which key slots it turns off. */
const SHAPES: Readonly<Record<CfgId, { gateway: readonly string[] | null; off: readonly string[]; consent: 'gateway' | 'openrouter' }>> = {
  cli_both: { gateway: ['url', 'jevPath', 'jevModel', 'openaiPath', 'openaiModel', 'headers'], off: [], consent: 'gateway' },
  cli_jev: { gateway: ['url', 'jevPath', 'jevModel', 'headers'], off: ['openai'], consent: 'gateway' },
  cli_jevor: { gateway: null, off: ['openai'], consent: 'openrouter' },
  cli_oa: { gateway: ['url', 'openaiPath', 'openaiModel', 'headers'], off: ['openrouter'], consent: 'gateway' },
};

function writePrivate(path: string, text: string): void {
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * Writes the eight XDG pairs (four cfgs, each with its `-ab` copy). `gatewayConfig` is the owner's config.json whose
 * gateway block and gateway key slot are copied; `consent` names the owner-granted consent.json per host kind.
 * Returns the config directories written.
 */
export function setupCfgs(file: CfgsFile, opts: { gatewayConfig: string; consent: { gateway: string; openrouter: string } }): string[] {
  const source = JSON.parse(readFileSync(opts.gatewayConfig, 'utf8')) as SourceConfig;
  const gateway = source.gateway ?? null;
  if (gateway === null || typeof gateway.url !== 'string') throw new Error(`${opts.gatewayConfig}: no gateway block`);
  refuseCredentialUrl('gateway.url', gateway.url);
  const written: string[] = [];
  for (const cfg of CFGS) {
    for (const backend of ['orca', 'agent-browser'] as const) {
      const shape = SHAPES[cfg];
      const xdg = xdgOf(file, cfg, backend);
      const configDir = join(xdg.config, 'refsure');
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
      mkdirSync(join(xdg.state, 'refsure'), { recursive: true, mode: 0o700 });
      const keys: Record<string, unknown> = {};
      if (shape.gateway !== null && source.keys?.gateway !== undefined) keys.gateway = source.keys.gateway;
      for (const slot of shape.off) keys[slot] = null;
      const config: Record<string, unknown> = {
        keys,
        ...(shape.gateway === null ? {} : { gateway: pick(gateway, shape.gateway) }),
        allowOrigins: [file.fixtureOrigin],
        piiMasks: true,
        requireIsolatedProfile: backend === 'orca',
        limits: { decisionsPerMinute: 600, usdPerDay: 20 },
      };
      writePrivate(join(configDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
      copyFileSync(opts.consent[shape.consent], join(configDir, 'consent.json'));
      chmodSync(join(configDir, 'consent.json'), 0o600);
      written.push(configDir);
    }
  }
  return written;
}
