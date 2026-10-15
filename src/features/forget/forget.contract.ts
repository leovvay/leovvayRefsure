/**
 * `refsure forget`: how many marks and tickets were removed, for one page or for every page. Under `--dry-run`
 * nothing is removed, and `would_remove` counts what would be.
 */
export interface ForgetResult {
  removed: number;
  scope: 'page' | 'all';
  would_remove?: number;
}
