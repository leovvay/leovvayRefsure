import type { CommandSpec, UsageError } from '../../cli';
import { BUNDLED_SKILL, SKILL_MAJOR } from './bundled-skill';
import type { SkillArgs } from './skill.args';
import type { SkillResult } from './skill.contract';

/**
 * `skill print` (spec §6.3, §10): the SKILL.md this binary was built with, so an agent's installed copy can match
 * the binary it calls. Its product is a file, so on success it prints the skill verbatim instead of an envelope:
 * `refsure skill print > ~/.claude/skills/refsure/SKILL.md`. A usage error is still an envelope.
 */
export const skillCommand: CommandSpec<SkillArgs, SkillResult> = {
  name: 'skill',
  summary: 'Print the agent skill (SKILL.md) bundled with this version, as the file itself, not an envelope',
  since: '0.1.0',
  stability: 'stable',
  options: {},
  forms: ['print'],
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw): SkillArgs | UsageError {
    const [action, ...extra] = raw.positionals;
    if (action !== 'print' || extra.length > 0) return { usage: 'skill takes one subcommand: print' };
    if (raw.rest.length > 0) return { usage: 'skill print takes nothing after --' };
    return { action };
  },
  async run() {
    const result: SkillResult = { refsure_skill: SKILL_MAJOR, bytes: Buffer.byteLength(BUNDLED_SKILL, 'utf8') };
    return { status: 'ok', acted: false, effect: 'none', result, text: BUNDLED_SKILL };
  },
};
