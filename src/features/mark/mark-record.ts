/**
 * A stored mark (spec §8.7): the page as it was before the agent acted on its own. `url` keeps no query or
 * fragment; `title` and `text` are redacted and PII-masked before they are written, so nothing secret sits on
 * disk, and a later read is cleaned the same way before it is compared.
 */
export interface MarkRecord {
  id: string;
  pageId: string;
  label: string | null;
  url: string;
  title: string;
  text: string;
  createdAt: number;
  ttlMs: number;
}
