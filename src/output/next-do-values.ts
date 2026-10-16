/**
 * Every `next.do` refsure emits (spec §6.1): the one list `NextDo` and `causes --json` share. It is an open set, so a
 * value added here arrives in a minor release and shows in `causes --json` as `next_do`.
 */
export const NEXT_DO = [
  'act', 'act_high_risk', 'dismiss', 'state', 'wait', 'snapshot', 'retry_within', 'needs_human', 'stop',
] as const;
