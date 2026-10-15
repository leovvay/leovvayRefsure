import type { DecisionAnswer, DecisionQuestion } from '../../../src/questions';

/** One frozen request exactly as it was sent before, with the answer stored for it then. */
export interface ParityItem {
  id: string;
  /** locate | dismiss | page_state | outcome (or the refsure site id). */
  site: string;
  question: string;
  state: Record<string, string>;
  questions: Record<string, DecisionQuestion>;
  stored: DecisionAnswer;
  /** The same request answered again then, when it was: the stored answers' own repeat agreement. */
  storedRepeats?: (DecisionAnswer | null)[];
  storedModel?: string;
}
