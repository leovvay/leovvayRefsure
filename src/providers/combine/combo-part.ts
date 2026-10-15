import type { ApprovedRequest, EgressRefusal } from '../../egress';
import type { DecisionAnswer, Threshold, Verdict } from '../../questions';
import type { DecisionProvider } from '../decision-provider';
import type { Rendering } from '../rendering';

/** One provider's half of a Decision: its own approved request, threshold and reader. */
export interface ComboPart<Out> {
  provider: DecisionProvider;
  request: ApprovedRequest;
  /** The site's question name: the answer is read back by it. */
  question: string;
  threshold: Threshold;
  /** The site's `read` with its presented order bound. */
  read(answer: DecisionAnswer, threshold: Threshold): Verdict<Out>;
  rendering?: Rendering;
  /**
   * Checked just before a part that is asked only after another part answered (OpenAI in `fallback`): the caps
   * again, now counting that earlier call. A refusal means this part is not asked.
   */
  admit?(): EgressRefusal | null;
}

/** Each part gets its own deadline; the signal stops all of them. */
export interface AskOptions { deadlineMs: number; signal: AbortSignal }
