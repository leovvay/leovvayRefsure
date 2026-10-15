import type { AbstainVerdict, Verdict } from '../../questions';

export type Abstain<Out> = AbstainVerdict<Out>;
export type Answer<Out> = Extract<Verdict<Out>, { kind: 'answer' }>;
