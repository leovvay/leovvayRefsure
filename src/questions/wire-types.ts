/*
  The Decision wire shape, ported from the author's earlier decision code. The
  fields are `instructions` (plural) and `criteria`; `instruction` / `options`
  is a 422 on every call. Score questions are not used by refsure.
*/

/** Select one of `criteria`'s keys; each value describes when that key applies. */
export interface DecisionChoiceQuestion { type: 'choice'; instructions: string; criteria: Record<string, string> }

/** A yes/no statement. `criteria` is both keys or neither. */
export interface DecisionNoulQuestion { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }

export type DecisionQuestion = DecisionChoiceQuestion | DecisionNoulQuestion;

export interface DecisionChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

/** The probability the statement is true. */
export interface DecisionNoulAnswer { type: 'noul'; noul: number }

export type DecisionAnswer = DecisionChoiceAnswer | DecisionNoulAnswer;

/** A Noul is `yes` at or above `yesAtLeast`, `no` at or below `noAtMost`, else abstain. */
export interface NoulBand { yesAtLeast: number; noAtMost: number }
