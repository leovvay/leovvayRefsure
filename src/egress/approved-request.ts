import type { DecisionQuestion, ProviderId, SiteId } from '../questions';

declare const approvedBrand: unique symbol;

/**
 * The only thing a provider accepts. Only `egress/pipeline.ts` constructs one, after consent, origin,
 * redaction, PII masks, bounds and limits, so unredacted page text cannot reach a provider.
 */
export interface ApprovedRequest {
  readonly [approvedBrand]: true;
  readonly site: SiteId;
  readonly provider: ProviderId;
  readonly host: string;
  readonly state: Readonly<Record<string, string>>;
  readonly questions: Readonly<Record<string, DecisionQuestion>>;
  /** UTF-8 length of the canonical JSON of `{state, questions}`. */
  readonly bytes: number;
  /** sha256 hex of the same canonical JSON. */
  readonly digest: string;
}
