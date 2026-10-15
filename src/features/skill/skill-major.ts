const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const MAJOR_LINE = /^refsure-skill:\s*["']?(\d{1,6})["']?\s*$/m;

/** The `refsure-skill:` major in a SKILL.md's frontmatter; `null` when it has no frontmatter or no such line. */
export function skillMajorOf(text: string): number | null {
  const head = FRONTMATTER.exec(text)?.[1];
  if (head === undefined) return null;
  const major = MAJOR_LINE.exec(head)?.[1];
  return major === undefined ? null : Number(major);
}
