import type { Envelope } from '../../output';
import skillText from '../../../skills/refsure/SKILL.md';

/** `skills/refsure/SKILL.md` as it was when this binary was built, byte for byte. */
export const BUNDLED_SKILL: string = skillText;

/**
 * The `refsure-skill:` major this binary speaks: the envelope major (spec §10). Typed by the envelope, so a major
 * bump there fails the build here until the skill is bumped with it.
 */
export const SKILL_MAJOR: Envelope['refsure'] = 1;
