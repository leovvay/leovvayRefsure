/** The closed set of outcomes; each maps to exactly one exit code (spec §6.1). */
export type Status =
  | 'ok' | 'abstained' | 'refused' | 'stale' | 'unavailable' | 'unsupported_by_backend'
  | 'spend_limit' | 'not_set_up' | 'not_in_orca_terminal' | 'effect_unknown' | 'usage';

export type NextDo =
  | 'act' | 'act_high_risk' | 'dismiss' | 'state' | 'wait' | 'snapshot' | 'retry_within' | 'needs_human' | 'stop';

/** `cause` is an open set; known values are listed by `refsure causes --json`. */
export interface Why { cause: string; detail: string }

/** `argv[0]` is always `refsure` or `orca`; `wait` carries `after_ms`. */
export interface Next { do: NextDo; argv?: string[]; after_ms?: number }
