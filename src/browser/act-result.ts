import type { ACT_ACTIONS } from './act-actions';

/** One of `ACT_ACTIONS`: the typed acts, in `--help` order. */
export type ActAction = (typeof ACT_ACTIONS)[number];

export type ActResult =
  | { kind: 'done' }
  /**
   * Nothing was dispatched: the ref resolved to no element (`browser_stale_ref`), or, with `covered` set, another
   * element sits over its click point (agent-browser 0.27.2+), which `covered` names as `tag#id` (page text).
   */
  | { kind: 'stale_ref'; covered?: string }
  /** Dispatched, or maybe dispatched: never retried. */
  | { kind: 'unknown'; detail: string };
