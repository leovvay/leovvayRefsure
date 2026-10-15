/**
 * One answered (or failed) call in runs-<site>.jsonl. `choice` is what the answer means in the item's own terms:
 * a candidate index, `none`, a state key, or `true`/`false` for a Noul (its `noul` beside it); `confidence` is the
 * Choice confidence or the Noul probability.
 */
export interface RunRow {
  id: string;
  site: string;
  salt: string;
  gold: string;
  alt: string[];
  risk: string | null;
  lang: string;
  source: string;
  condition: string;
  /** `ok`, a provider status after retries, or `refused:<cause>` when the egress pipeline refused it. */
  status: string;
  choice: string | null;
  confidence: number | null;
  noul?: number;
  correct: boolean | null;
  /** The wording hash the request was built under; the fit keeps rows on the site's declared wording only. */
  wording: string;
  model: string | null;
  usd: number | null;
  ms: number;
  attempts: number;
  digest: string | null;
  ts: string;
}
