export interface TabInfo {
  id: string;
  url: string;
  title: string;
  loadError: string | null;
  certificateFailure: string | null;
  profileId: string | null;
  profileLabel: string | null;
  /**
   * Which tab answered, when the page id can name more than one: the agent-browser session's active tab id
   * (`t1`). A ticket records it, and `act` answers `page_changed` when another tab is active by then. Orca leaves it
   * out: its page id names one tab.
   */
  tabKey?: string | null;
}
