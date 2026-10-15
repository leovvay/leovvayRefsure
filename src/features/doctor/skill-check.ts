import { join } from 'node:path';
import { findInstalledSkills, homeOf, SKILL_HOMES, SKILL_MAJOR } from '../skill';
import type { InstalledSkill } from '../skill';
import type { DoctorCheck } from './doctor-check';

const SHELL_SAFE = /^[\w@%+=:,./-]+$/;

function current(skill: InstalledSkill): boolean {
  return skill.problem === null && skill.major === SKILL_MAJOR;
}

/** A path as one shell word: as is when it is plain, else single-quoted. */
function shellWord(path: string): string {
  return SHELL_SAFE.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`;
}

function describe(skill: InstalledSkill): string {
  if (skill.notAFile) return `${skill.path}: ${skill.problem}, stale; remove it first`;
  if (skill.problem !== null) return `${skill.path}: ${skill.problem}, stale`;
  if (skill.major !== SKILL_MAJOR) return `${skill.path}: refsure-skill ${skill.major}, this binary speaks ${SKILL_MAJOR}: stale`;
  return `${skill.path}: refsure-skill ${skill.major}, current`;
}

/**
 * One command that rewrites every stale copy a write can reach with this binary's skill, or `null` when none can.
 * A path that is not a regular file is left out: a redirect into a FIFO blocks, into a folder fails. Its own line
 * says to remove it first.
 */
function refreshOf(stale: readonly InstalledSkill[]): string | null {
  const targets = stale.filter((skill) => !skill.notAFile).map((skill) => shellWord(skill.path));
  if (targets.length === 0) return null;
  if (targets.length === 1) return `refresh: refsure skill print > ${targets[0]}`;
  return `refresh all: refsure skill print | tee ${targets.join(' ')} > /dev/null`;
}

/**
 * `skill_stale` (spec §10): an installed copy whose `refsure-skill:` major differs from the envelope major teaches
 * an agent a contract this binary does not speak. Minor drift is fine: version detail comes from `commands --json`.
 * No copy installed is not stale. The detail ends with one command that refreshes every stale copy it can write.
 */
export function skillCheck(env: NodeJS.ProcessEnv): DoctorCheck {
  const found = findInstalledSkills(env);
  if (found.length === 0) {
    const where = join(homeOf(env), `{${SKILL_HOMES.join(',')}}`, 'skills', 'refsure', 'SKILL.md');
    return { name: 'skill_stale', ok: true, detail: `no installed skill at ${where}; refsure skill print gives this version's` };
  }
  const stale = found.filter((skill) => !current(skill));
  const parts = found.map(describe);
  const refresh = refreshOf(stale);
  if (refresh !== null) parts.push(refresh);
  return { name: 'skill_stale', ok: stale.length === 0, detail: parts.join('; ') };
}
