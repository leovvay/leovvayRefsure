export type AbstainCause =
  /** → abstained */
  | 'none_chosen' | 'low_confidence' | 'disagree' | 'twins'
  /** → unavailable */
  | 'provider_timeout' | 'provider_error'
  /** → refused */
  | 'oversize' | 'origin_denied' | 'provider_not_allowed'
  /** → not_set_up / spend_limit */
  | 'not_set_up' | 'spend_limit';

/**
 * A choice site's offered options by the model's own probabilities, best first, `none` and unknown keys left out.
 * A ranking, not calibrated probabilities: `locate --top` shows it as such.
 */
export type Ranking<Out> = readonly { value: Out; p: number }[];

export type Verdict<Out> =
  | {
    kind: 'answer'; value: Out; index: string | null; confidence: number | null; threshold: number | null;
    ranking?: Ranking<Out>;
  }
  | {
    kind: 'abstain';
    ranking?: Ranking<Out>;
    cause: AbstainCause;
    detail: string;
    /** The option the model leaned to, quoted in refusals. */
    leaned: string | null;
    confidence: number | null;
    threshold: number | null;
    /** The provider refused the key itself (HTTP 401, 402, 403): asking again, over any input, fails the same way. */
    permanent?: true;
  };

export type AbstainVerdict<Out> = Extract<Verdict<Out>, { kind: 'abstain' }>;
