import { join } from 'node:path';
import { findInstalledSkills, homeOf, SKILL_HOMES, SKILL_MAJOR } from '../skill';
import type { InstalledSkill } from '../skill';
import type { DoctorCheck } from './doctor-check';

function current(skill: InstalledSkill): boolean {
  return skill.problem === null && skill.major === SKILL_MAJOR;
}

function describe(skill: InstalledSkill): string {
  if (skill.problem !== null) return `${skill.path}: unreadable (${skill.problem}), treated as stale`;
  if (skill.major === null) return `${skill.path}: no refsure-skill in its frontmatter, stale`;
  if (skill.major !== SKILL_MAJOR) return `${skill.path}: refsure-skill ${skill.major}, this binary speaks ${SKILL_MAJOR}: stale`;
  return `${skill.path}: refsure-skill ${skill.major}, current`;
}

/**
 * `skill_stale` (spec §10): an installed copy whose `refsure-skill:` major differs from the envelope major teaches
 * an agent a contract this binary does not speak. Minor drift is fine: version detail comes from `commands --json`.
 * No copy installed is not stale.
 */
export function skillCheck(env: NodeJS.ProcessEnv): DoctorCheck {
  const found = findInstalledSkills(env);
  if (found.length === 0) {
    const where = join(homeOf(env), `{${SKILL_HOMES.join(',')}}`, 'skills', 'refsure', 'SKILL.md');
    return { name: 'skill_stale', ok: true, detail: `no installed skill at ${where}; refsure skill print gives this version's` };
  }
  const stale = found.filter((skill) => !current(skill));
  const parts = found.map(describe);
  if (stale.length > 0) parts.push(`refresh: refsure skill print > ${stale[0]?.path ?? 'SKILL.md'}`);
  return { name: 'skill_stale', ok: stale.length === 0, detail: parts.join('; ') };
}
