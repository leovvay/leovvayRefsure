import type { ProviderId, Verdict } from '../../questions';
import type { ProviderAnswer } from '../decision-provider';

/** What one asked provider answered, and how its part read it. */
export interface PartOutcome<Out> {
  provider: ProviderId;
  host: string;
  /** The model asked for; `answer.model` is the one that answered, when known. */
  model: string;
  answer: ProviderAnswer;
  verdict: Verdict<Out>;
}

/** The combined verdict, and every part that was actually asked, in the order asked. */
export interface ComboOutcome<Out> { verdict: Verdict<Out>; parts: PartOutcome<Out>[] }
