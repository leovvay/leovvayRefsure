import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/freeze';
import { agentFile } from './config';
import type { AgentArm, AgentsConfig } from './config';

/*
  One isolated run directory per agent run (6.5): `R/home` (HOME), `R/work` (cwd, git-initialised so Codex finds
  project skills), `R/bin` (PATH: node, orca and in rs refsure, the last two copies of shim.mjs), `R/tmp` (TMPDIR),
  `R/out` (transcript, shim log, reply). Skills go to both agents' project skill dirs.
*/

export interface Skills { texts: Record<string, string>; sha: Record<string, string> }
export interface RunDir { root: string; home: string; work: string; bin: string; tmp: string; out: string }

const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

/** `<UTC start>-<6 hex>`, the ledger's run id shape. */
export function newRunId(): string {
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/**
 * The skills both arms may carry, read once per phase: refsure's from `refsure skill print` at the Frozen commit
 * (its sha256 must equal `skills/refsure/SKILL.md`), orca-cli from the P0 copy (its sha256 pinned when given).
 */
export function loadSkills(config: AgentsConfig): Skills {
  const printed = execFileSync(process.execPath, [config.refsure.dist, 'skill', 'print'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: config.runRoot } });
  const own = readFileSync(join(repoRoot(), 'skills', 'refsure', 'SKILL.md'), 'utf8');
  if (sha256(printed) !== sha256(own)) throw new Error('refsure skill print differs from skills/refsure/SKILL.md at the Frozen commit');
  const texts: Record<string, string> = { refsure: printed };
  for (const [name, path] of Object.entries(config.skills)) texts[name] = readFileSync(path, 'utf8');
  const sha = Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, sha256(text)]));
  for (const [name, pinned] of Object.entries(config.skillSha ?? {})) {
    if (sha[name] !== pinned) throw new Error(`skill ${name}: sha256 differs from the pinned copy`);
  }
  return { texts, sha };
}

/**
 * A login shell runs macOS path_helper (/etc/zprofile, /etc/profile), which puts /usr/local/bin, where the real
 * `orca` lives, before `R/bin`. Every startup file a login or interactive zsh, bash or sh reads after it sets PATH
 * back to 6.5's value, so the shims stay first whichever shell an agent's tool starts (A4).
 */
function pinLoginPath(dir: RunDir): void {
  const line = `export PATH='${dir.bin}:/usr/bin:/bin'\n`;
  for (const name of ['.zprofile', '.zshrc', '.bash_profile', '.bashrc', '.profile']) writeFileSync(join(dir.home, name), line, { mode: 0o444 });
}

/** Creates `R` for one run; the rs arm alone gets the refsure skill and the refsure shim. */
export function makeRunDir(config: AgentsConfig, runId: string, arm: AgentArm, skills: Skills, shimPath = agentFile('shim.mjs')): RunDir {
  const root = join(config.runRoot, runId);
  const dir: RunDir = { root, home: join(root, 'home'), work: join(root, 'work'), bin: join(root, 'bin'), tmp: join(root, 'tmp'), out: join(root, 'out') };
  for (const path of [dir.home, dir.work, dir.bin, dir.tmp, dir.out]) mkdirSync(path, { recursive: true, mode: 0o700 });
  execFileSync('/usr/bin/git', ['init', '-q', dir.work], { env: { PATH: '/usr/bin:/bin', HOME: dir.home }, stdio: 'ignore' });
  const names = Object.keys(skills.texts).filter((name) => name !== 'refsure' || arm === 'rs');
  for (const name of names) {
    for (const base of ['.claude', '.agents']) {
      const skillDir = join(dir.work, base, 'skills', name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), skills.texts[name]!);
    }
  }
  pinLoginPath(dir);
  symlinkSync(process.execPath, join(dir.bin, 'node'));
  for (const tool of arm === 'rs' ? ['orca', 'refsure'] : ['orca']) {
    copyFileSync(shimPath, join(dir.bin, tool));
    chmodSync(join(dir.bin, tool), 0o755);
  }
  return dir;
}
