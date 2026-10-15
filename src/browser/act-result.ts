export type ActAction = 'click' | 'dblclick' | 'fill' | 'select' | 'check' | 'uncheck';

export type ActResult =
  | { kind: 'done' }
  /** `browser_stale_ref`: nothing was dispatched. */
  | { kind: 'stale_ref' }
  /** Dispatched, or maybe dispatched: never retried. */
  | { kind: 'unknown'; detail: string };
