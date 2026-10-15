import type { DecisionAnswer, SiteId, SiteRequest } from '../../../src/questions';

/** One item built through refsure's own site, in one order, and how its answer reads back. */
export interface BuiltItem {
  site: SiteId;
  question: string;
  wording: string;
  request: SiteRequest;
  read(answer: DecisionAnswer | undefined): { choice: string | null; confidence: number | null; noul?: number };
}
