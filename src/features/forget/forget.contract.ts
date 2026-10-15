/** `refsure forget`: how many marks and tickets were removed, for one page or for every page. */
export interface ForgetResult {
  removed: number;
  scope: 'page' | 'all';
}
