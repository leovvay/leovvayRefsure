export type AbstainCause =
  /** → abstained */
  | 'none_chosen' | 'low_confidence' | 'disagree'
  /** → unavailable */
  | 'provider_timeout' | 'provider_error'
  /** → refused */
  | 'oversize' | 'origin_denied' | 'provider_not_allowed'
  /** → not_set_up / spend_limit */
  | 'not_set_up' | 'spend_limit';

export type Verdict<Out> =
  | { kind: 'answer'; value: Out; index: string | null; confidence: number | null; threshold: number | null }
  | {
    kind: 'abstain';
    cause: AbstainCause;
    detail: string;
    /** The option the model leaned to, quoted in refusals. */
    leaned: string | null;
    confidence: number | null;
    threshold: number | null;
    /** The provider refused the key itself (HTTP 401, 402, 403): asking again, over any input, fails the same way. */
    permanent?: true;
  };
