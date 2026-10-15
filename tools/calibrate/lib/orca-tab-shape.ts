/** One Orca tab the replay drives: its page id, the profile Orca reports for it, `goto` and `close`. */
export interface OrcaTab {
  pageId: string;
  /** The profile id when `tab profile show` names the one asked for; `null` when it could not be confirmed. */
  profile: string | null;
  /** Navigates and returns the URL Orca reports. */
  goto(url: string): Promise<string>;
  close(): Promise<void>;
}
