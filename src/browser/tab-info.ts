export interface TabInfo {
  id: string;
  url: string;
  title: string;
  loadError: string | null;
  certificateFailure: string | null;
  profileId: string | null;
  profileLabel: string | null;
}
