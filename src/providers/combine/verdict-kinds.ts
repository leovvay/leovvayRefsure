import type { Verdict } from '../../questions';

export type Abstain<Out> = Extract<Verdict<Out>, { kind: 'abstain' }>;
export type Answer<Out> = Extract<Verdict<Out>, { kind: 'answer' }>;
