/**
 * Every `next.do` refsure emits (spec §6.1): the one list `NextDo` and `causes --json` share. It is an open set, so a
 * value added here arrives in a minor release and shows in `causes --json` as `next_do`. `open_session`: the agent
 * opens its own headless agent-browser session (`argv`, with its URL in place of `<url>`); refsure never opens one.
 */
export const NEXT_DO = [
  'act', 'act_high_risk', 'dismiss', 'state', 'wait', 'snapshot', 'retry_within', 'open_session', 'needs_human', 'stop',
] as const;
