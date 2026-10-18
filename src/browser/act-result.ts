import type { ACT_ACTIONS } from './act-actions';

/** One of `ACT_ACTIONS`: the typed acts, in `--help` order. */
export type ActAction = (typeof ACT_ACTIONS)[number];

export type ActResult = (
  | { kind: 'done' }
  /**
   * Nothing was dispatched: the ref resolved to no element (`browser_stale_ref`), or, with `covered` set, another
   * element sits over its click point (agent-browser 0.27.2+), which `covered` names as `tag#id` (page text). With
   * `focused` set, only the focus a fill sends first was dispatched (its handlers ran), and the element was gone
   * when the text was to go in: no text was written.
   */
  | { kind: 'stale_ref'; covered?: string; focused?: true }
  /** Dispatched, or maybe dispatched: never retried. */
  | { kind: 'unknown'; detail: string }
) & {
  /** How Orca sent a click (`native`, or `fallback:<why>` to agent-browser's click), for `REFSURE_RUN_TIMING` only. */
  via?: string;
};
