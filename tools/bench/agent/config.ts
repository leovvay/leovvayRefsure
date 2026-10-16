import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { refuseCredentialUrl, refuseKeyShaped } from '../lib/arms';
import { repoRoot } from '../lib/freeze';

/*
  The agent-level config (P8): binaries, models, the isolated Orca profile, the cli_both XDG pair and the NAMES of
  the env variables that carry credentials. It lives outside every repo, path in `REFSURE_BENCH_AGENTS`; its sha256
  goes on every agent row, its content never does. No value in it is a credential: credentials stay in the
  environment of the process that needs them (the harness for the agent's own credential, the broker for refsure's).
*/

export type AgentId = 'claude' | 'codex';
export type AgentArm = 'rs' | 'base';
export const AGENTS: readonly AgentId[] = ['claude', 'codex'];
export const AGENT_ARMS: readonly AgentArm[] = ['rs', 'base'];

/** An env NAME in the process that holds the value (`from`), and the NAME the child reads it under (`as`). */
export interface EnvMap { from: string; as: string }

export interface AgentsConfig {
  v: 1;
  /** Parent of every run directory `R` (outside the probe dir, so agent files never read as peeking). */
  runRoot: string;
  /** The fixture server origin (6.1); every task URL is this plus the fixture's `entry`. */
  fixtureBase: string;
  /** Extra path fragments whose appearance in an agent command flags `peeked` (the bench dir is always one). */
  peekPaths: string[];
  orca: { bin: string; worktreeId: string; profile: string };
  refsure: { dist: string; xdgConfig: string; xdgState: string; key: EnvMap };
  /** argv prefix that starts the broker with refsure's key in its env (a secret-store runner); [] = none. */
  broker: { launcher: string[] };
  /** Skill name -> SKILL.md copied read-only at P0 (`orca-cli`); `skillSha` pins each when given. */
  skills: Record<string, string>;
  skillSha?: Record<string, string>;
  /** Codex list prices per million tokens recorded at P0 (7.2); absent = Codex cost in tokens only. */
  prices?: string;
  claude: {
    bin: string; version: string; model: string; effort: string;
    credential: EnvMap; maxBudgetUsd: number; maxTurns: number;
  };
  codex: { dir: string; version: string; model: string; effort: string; home: string };
}

export interface LoadedAgentsConfig { config: AgentsConfig; sha: string; path: string }

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

function str(where: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where}: a non-empty string is required`);
  return value;
}

function abs(where: string, value: unknown): string {
  const text = str(where, value);
  if (!isAbsolute(text)) throw new Error(`${where}: an absolute path is required`);
  return text;
}

function envName(where: string, value: unknown): string {
  const text = str(where, value);
  if (!ENV_NAME.test(text)) throw new Error(`${where}: an env variable NAME is required`);
  refuseKeyShaped(where, text);
  return text;
}

function envMap(where: string, value: unknown): EnvMap {
  const v = (value ?? {}) as Record<string, unknown>;
  return { from: envName(`${where}.from`, v.from), as: envName(`${where}.as`, v.as) };
}

function obj(where: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where}: an object is required`);
  return value as Record<string, unknown>;
}

function positive(where: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${where}: a positive number is required`);
  return value;
}

/** Reads and validates the agent config; never echoes a value it refuses. */
export function readAgentsConfig(path = process.env.REFSURE_BENCH_AGENTS): LoadedAgentsConfig {
  if (path === undefined || path === '') throw new Error('REFSURE_BENCH_AGENTS is not set: name the agent config file');
  const bytes = readFileSync(path);
  const raw = obj('agents config', JSON.parse(bytes.toString('utf8')));
  if (raw.v !== 1) throw new Error('agents config: v must be 1');
  const fixtureBase = str('fixtureBase', raw.fixtureBase).replace(/\/+$/, '');
  refuseCredentialUrl('fixtureBase', fixtureBase);
  const orca = obj('orca', raw.orca);
  const refsure = obj('refsure', raw.refsure);
  const broker = obj('broker', raw.broker ?? { launcher: [] });
  const launcher = Array.isArray(broker.launcher) ? broker.launcher.map((part, i) => str(`broker.launcher[${i}]`, part)) : [];
  for (const [i, part] of launcher.entries()) refuseKeyShaped(`broker.launcher[${i}]`, part);
  const skills = obj('skills', raw.skills);
  const claude = obj('claude', raw.claude);
  const codex = obj('codex', raw.codex);
  const config: AgentsConfig = {
    v: 1,
    runRoot: abs('runRoot', raw.runRoot),
    fixtureBase,
    peekPaths: Array.isArray(raw.peekPaths) ? raw.peekPaths.map((p, i) => str(`peekPaths[${i}]`, p)) : [],
    orca: { bin: abs('orca.bin', orca.bin), worktreeId: str('orca.worktreeId', orca.worktreeId), profile: str('orca.profile', orca.profile) },
    refsure: {
      dist: abs('refsure.dist', refsure.dist),
      xdgConfig: abs('refsure.xdgConfig', refsure.xdgConfig),
      xdgState: abs('refsure.xdgState', refsure.xdgState),
      key: envMap('refsure.key', refsure.key),
    },
    broker: { launcher },
    skills: Object.fromEntries(Object.entries(skills).map(([name, p]) => [name, abs(`skills.${name}`, p)])),
    skillSha: raw.skillSha === undefined ? undefined
      : Object.fromEntries(Object.entries(obj('skillSha', raw.skillSha)).map(([name, s]) => [name, str(`skillSha.${name}`, s)])),
    prices: raw.prices === undefined ? undefined : abs('prices', raw.prices),
    claude: {
      bin: abs('claude.bin', claude.bin), version: str('claude.version', claude.version),
      model: str('claude.model', claude.model), effort: str('claude.effort', claude.effort),
      credential: envMap('claude.credential', claude.credential),
      maxBudgetUsd: positive('claude.maxBudgetUsd', claude.maxBudgetUsd ?? 5),
      maxTurns: positive('claude.maxTurns', claude.maxTurns ?? 100),
    },
    codex: {
      dir: abs('codex.dir', codex.dir), version: str('codex.version', codex.version),
      model: str('codex.model', codex.model), effort: str('codex.effort', codex.effort), home: abs('codex.home', codex.home),
    },
  };
  if (config.skills['orca-cli'] === undefined) throw new Error('skills: orca-cli is required (both arms carry it)');
  return { config, sha: createHash('sha256').update(bytes).digest('hex'), path };
}

/** Codex list prices, USD per million tokens (7.2), or null when none were recorded. */
export interface CodexPrices { input: number; cached_input: number; output: number }

export function readCodexPrices(config: AgentsConfig): CodexPrices | null {
  if (config.prices === undefined) return null;
  const raw = obj('prices', JSON.parse(readFileSync(config.prices, 'utf8')));
  const codex = raw.codex === undefined ? null : obj('prices.codex', raw.codex);
  if (codex === null) return null;
  return {
    input: positive('prices.codex.input', codex.input),
    cached_input: positive('prices.codex.cached_input', codex.cached_input),
    output: positive('prices.codex.output', codex.output),
  };
}

/** A file of this directory, found through the repo root so a bundle outside the repo still reads the frozen one. */
export function agentFile(name: string): string {
  return join(repoRoot(), 'tools', 'bench', 'agent', name);
}
