import type { SkillMajorRead } from './skill-major-read';

/** YAML frontmatter: a `---` line first (after an optional BOM), up to the next `---` line; trailing blanks allowed. */
const FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
/** A top-level `refsure-skill:` key; an indented one belongs to another mapping. */
const MAJOR_LINE = /^refsure-skill:(.*)$/m;
const QUOTED = /^(["'])(.*?)\1(?:[ \t]+#.*)?$/;
const WHOLE = /^\d{1,6}$/;
const SHOWN_MAX = 24;

/** The scalar after the colon: unquoted, without a trailing ` # comment`. */
function scalarOf(raw: string): string {
  const text = raw.trim();
  const quoted = QUOTED.exec(text);
  if (quoted !== null) return quoted[2]!.trim();
  return text.replace(/(?:^|[ \t]+)#.*$/, '').trim();
}

/** A value fit to quote in a doctor detail: control characters dropped, clipped. */
function shown(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '');
  return clean.length > SHOWN_MAX ? `${clean.slice(0, SHOWN_MAX)}…` : clean;
}

/** The `refsure-skill:` major in a SKILL.md's frontmatter, or the reason it has none. */
export function readSkillMajor(text: string): SkillMajorRead {
  const head = FRONTMATTER.exec(text)?.[1];
  if (head === undefined) return { major: null, problem: 'no frontmatter (a --- block at the top)' };
  const raw = MAJOR_LINE.exec(head)?.[1];
  if (raw === undefined) return { major: null, problem: 'no refsure-skill in its frontmatter' };
  const value = scalarOf(raw);
  if (value === '') return { major: null, problem: 'refsure-skill has no value' };
  if (!WHOLE.test(value)) return { major: null, problem: `refsure-skill value '${shown(value)}' is not a whole number` };
  return { major: Number(value), problem: null };
}
