import type { ACT_ACTIONS } from './act-actions';

/** One of `ACT_ACTIONS`: the typed acts, in `--help` order. */
export type ActAction = (typeof ACT_ACTIONS)[number];

export type ActResult =
  | { kind: 'done' }
  /** `browser_stale_ref`: nothing was dispatched. */
  | { kind: 'stale_ref' }
  /** Dispatched, or maybe dispatched: never retried. */
  | { kind: 'unknown'; detail: string };
