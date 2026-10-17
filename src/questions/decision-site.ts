import type { SiteId, Maturity } from './site-id';
import type { SitePolicy, Threshold } from './site-policy';
import type { SiteRequest } from './site-request';
import type { Verdict } from './verdict';
import type { DecisionAnswer, DecisionQuestion } from './wire-types';

/** One Decision question and how its answer is read (spec §5.2). `build` and `read` are pure. */
export interface DecisionSite<In, Ctx, Out> {
  id: SiteId;
  kind: 'choice' | 'noul';
  /** The question's name in `SiteRequest.questions`; the answer is read back by it. */
  question: string;
  wording: { version: number; hash: string };
  policy: SitePolicy;
  /** The input may lower maturity (a custom state set is experimental). */
  maturityFor?(input: In): Maturity;
  /** The wording hash for this input, when it differs from `wording.hash` (custom state sets). */
  wordingFor?(input: In): { version: number; hash: string };
  build(input: In): { request: SiteRequest; context: Ctx };
  read(answer: DecisionAnswer, context: Ctx, threshold: Threshold): Verdict<Out>;
  /**
   * A site that asks several questions in one request reads them together, in place of `read`: every answer, as
   * validated, and the questions as sent (redacted and masked), so its own twin rule reads what the model saw.
   */
  readAll?(
    answers: Readonly<Record<string, DecisionAnswer>>, context: Ctx, threshold: Threshold,
    sent: Readonly<Record<string, DecisionQuestion>>,
  ): Verdict<Out>;
}
