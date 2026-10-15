/** A copy of the skill an agent host would load: where it is, and the major its frontmatter names. */
export interface InstalledSkill {
  path: string;
  /** `null` when the file names no usable major or could not be read; `problem` then says which. */
  major: number | null;
  problem: string | null;
  /**
   * Something other than a regular file sits at the path (a FIFO, a folder). A refresh must not write through it:
   * a redirect into a FIFO blocks. It has to be removed first.
   */
  notAFile: boolean;
}
