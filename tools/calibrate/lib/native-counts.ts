/** What an Orca-native capture did with a set's items, written into its meta file beside the set's hash. */
export interface NativeCounts {
  /** Items asked (a page-state item asked in two mask modes counts twice). */
  asked: number;
  /** Settled by refsure's own code with no Decision, and how many of those were right. */
  code: number;
  codeCorrect: number;
  /** Rows the replay could not use, by reason (gold not on the page, a capture error). */
  dropped: Record<string, number>;
  /** Set rows never opened, by reason (no stored page, a task with no replay, a source not kept). */
  skipped: Record<string, number>;
  /** Asked items whose gold element was on the page but on no offered line: only `none` can be right. */
  goldNotOffered: number;
  /** The isolated Orca profile the pages were opened in, as Orca reported it for the tab. */
  profile: string | null;
  /** A set written for refsure (`sets/`), or a frozen benchmark set whose items keep their stored page. */
  origin?: 'refsure' | 'frozen';
}
