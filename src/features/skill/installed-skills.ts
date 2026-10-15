import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstalledSkill } from './installed-skill';
import { readSkillMajor } from './skill-major';

/** The agent homes whose global skills folder refsure looks in (spec §6.3 doctor, §11 skill install). */
export const SKILL_HOMES: readonly string[] = ['.claude', '.codex', '.agents'];

/** The frontmatter sits at the top: a few KB is plenty, and a huge file is not read whole. */
const HEAD_BYTES = 16 * 1024;
/** Non-blocking, so a FIFO at the path cannot hang the open; `fstat` then refuses anything but a regular file. */
const READ_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK;
const NOT_A_FILE = 'not a regular file';

/** The file's first bytes, or the reason it cannot be read as a file. */
function readHead(path: string): { text: string } | { problem: string } {
  const fd = openSync(path, READ_FLAGS);
  try {
    if (!fstatSync(fd).isFile()) return { problem: NOT_A_FILE };
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    return { text: buffer.subarray(0, read).toString('utf8') };
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
      const head = readHead(path);
      if ('problem' in head) {
        found.push({ path, major: null, problem: head.problem, notAFile: true });
        continue;
      }
      found.push({ path, ...readSkillMajor(head.text), notAFile: false });
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      found.push({ path, major: null, problem: `unreadable (${code})`, notAFile: false });
    }
  }
  return found;
}
