import type { NEXT_DO } from './next-do-values';

/** The closed set of outcomes; each maps to exactly one exit code (spec §6.1). */
export type Status =
  | 'ok' | 'abstained' | 'refused' | 'stale' | 'unavailable' | 'unsupported_by_backend'
  | 'spend_limit' | 'not_set_up' | 'not_in_orca_terminal' | 'effect_unknown' | 'usage';

export type NextDo = (typeof NEXT_DO)[number];

/** `cause` and `next.do` are open sets; the installed version's values are listed by `refsure causes --json`. */
export interface Why { cause: string; detail: string }

/** `argv[0]` is always `refsure` or `orca`; `wait` carries `after_ms`. */
export interface Next { do: NextDo; argv?: string[]; after_ms?: number }
