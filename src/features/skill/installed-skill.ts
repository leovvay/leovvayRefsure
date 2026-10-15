/** A copy of the skill an agent host would load: where it is, and the major its frontmatter names. */
export interface InstalledSkill {
  path: string;
  /** `null` when the frontmatter names none, or the file could not be read (`problem` says which). */
  major: number | null;
  problem: string | null;
}
