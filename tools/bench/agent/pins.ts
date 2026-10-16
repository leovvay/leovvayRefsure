import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { assertFrozen, repoRoot } from '../lib/freeze';
import type { FreezeEntry } from '../lib/freeze';
import { agentFile } from './config';
import type { AgentsConfig } from './config';

/*
  The P8 pins every phase asserts before its first run (6.1, 6.5, 9.4): the copied agent binaries, the fixture
  pages, the shim, the broker and refsure's built dist each hash to their freeze-table row, and each agent binary
  reports the pinned version. A directory (the copied Codex package) hashes as its tree: sha256 over the sorted
  lines `<relative path>\0<file sha256>\n` of every regular file under it; a symlink hashes as `-> <target>`.
*/

const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

export function treeSha(dir: string): string {
  const lines: string[] = [];
  const walk = (path: string) => {
    const st = lstatSync(path);
    if (st.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (st.isSymbolicLink()) lines.push(`${relative(dir, path)}\0-> ${execFileSync('/usr/bin/readlink', [path], { encoding: 'utf8' }).trim()}\n`);
    else if (st.isFile()) lines.push(`${relative(dir, path)}\0${sha256(readFileSync(path))}\n`);
  };
  walk(dir);
  return sha256(lines.sort().join(''));
}

/** The tree's sha256 when a table row names the directory (same path, a `/` suffix, or its basename) with it. */
export function assertFrozenTree(table: readonly FreezeEntry[], dir: string): string {
  const sha = treeSha(dir);
  const abs = resolve(dir).replace(/\/+$/, '');
  const named = table.filter((e) => {
    const file = e.file.replace(/^\.\//, '').replace(/\/+$/, '');
    return file === dir || abs.endsWith(`/${file}`) || basename(file) === basename(abs);
  });
  if (named.some((e) => e.sha256 === sha)) return sha;
  throw new Error(named.length > 0
    ? `${dir}: tree sha256 ${sha.slice(0, 12)} differs from the frozen ${named[0]!.sha256.slice(0, 12)}`
    : `${dir}: not in the freeze table`);
}

/** Every regular file under `dir`, sorted. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    const st = lstatSync(path);
    if (st.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (st.isFile()) out.push(path);
  };
  walk(dir);
  return out.sort();
}

export interface PinnedFiles { files: number; claude_bin: string; codex_tree: string; shim: string; broker: string; dist: string }

/** 6.1 and 9.4: every file the agents' runs depend on is the frozen one. Throws on the first that is not. */
export function assertAgentFilesFrozen(table: readonly FreezeEntry[], config: AgentsConfig): PinnedFiles {
  const pages = filesUnder(join(repoRoot(), 'tools', 'bench', 'fixtures', 'pages'));
  for (const page of pages) assertFrozen(table, page);
  return {
    files: pages.length + 5,
    claude_bin: assertFrozen(table, config.claude.bin),
    codex_tree: assertFrozenTree(table, config.codex.dir),
    shim: assertFrozen(table, agentFile('shim.mjs')),
    broker: assertFrozen(table, agentFile('broker.mjs')),
    dist: assertFrozen(table, config.refsure.dist),
  };
}

export interface AgentVersions { claude: string; codex: string }

/**
 * Each copied agent binary's own `--version` (6.5 pins): Claude prints `<version> (Claude Code)`, Codex
 * `codex-cli <version>`. Run with an empty HOME and no updater, so asking changes nothing. Throws on a mismatch.
 */
export function assertAgentVersions(config: AgentsConfig, home: string): AgentVersions {
  const env = { HOME: home, PATH: '/usr/bin:/bin', DISABLE_AUTOUPDATER: '1', CODEX_HOME: config.codex.home };
  const ask = (cmd: string, args: string[]) => execFileSync(cmd, args, { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const claude = ask(config.claude.bin, ['--version']);
  const codex = ask(process.execPath, [join(config.codex.dir, 'bin', 'codex.js'), '--version']);
  const word = (text: string, version: string) => text.split(/\s+/).includes(version);
  if (!word(claude, config.claude.version)) throw new Error(`claude --version says "${claude}", not the pinned ${config.claude.version}`);
  if (!word(codex, config.codex.version)) throw new Error(`codex --version says "${codex}", not the pinned ${config.codex.version}`);
  return { claude, codex };
}
