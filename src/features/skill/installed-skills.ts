import { closeSync, openSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstalledSkill } from './installed-skill';
import { skillMajorOf } from './skill-major';

/** The agent homes whose global skills folder refsure looks in (spec §6.3 doctor, §11 skill install). */
export const SKILL_HOMES: readonly string[] = ['.claude', '.codex', '.agents'];

/** The frontmatter sits at the top: a few KB is plenty, and a huge file is not read whole. */
const HEAD_BYTES = 16 * 1024;

function readHead(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unreadable';
}

/** The home folder: `HOME` as this process sees it, else the OS account's. */
export function homeOf(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || homedir();
}

/** Every installed copy of the skill under `<home>/{.claude,.codex,.agents}/skills/refsure/SKILL.md`. */
export function findInstalledSkills(env: NodeJS.ProcessEnv): InstalledSkill[] {
  const home = homeOf(env);
  const found: InstalledSkill[] = [];
  for (const dir of SKILL_HOMES) {
    const path = join(home, dir, 'skills', 'refsure', 'SKILL.md');
    try {
      found.push({ path, major: skillMajorOf(readHead(path)), problem: null });
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      found.push({ path, major: null, problem: code });
    }
  }
  return found;
}
