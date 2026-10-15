/** Every typed act, in `--help` order: the one list `ActAction`, the parsers and the ticket reader share. */
export const ACT_ACTIONS = ['click', 'dblclick', 'fill', 'select', 'check', 'uncheck'] as const;

export type ActAction = (typeof ACT_ACTIONS)[number];

/** The acts that take a `--value`: the text to fill, the option to select. Never logged, sent or shown. */
export const VALUE_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select']);

/** The acts that click: the page raisers and the confirm-dialog rule read them. */
export const CLICK_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['click', 'dblclick']);

/** The acts on a form field: the field raisers read them, and the class starts at write. */
export const FIELD_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select', 'check', 'uncheck']);

/** Whether `value` names a typed act. */
export function isActAction(value: string): value is ActAction {
  return (ACT_ACTIONS as readonly string[]).includes(value);
}

export type ActResult =
  | { kind: 'done' }
  /** `browser_stale_ref`: nothing was dispatched. */
  | { kind: 'stale_ref' }
  /** Dispatched, or maybe dispatched: never retried. */
  | { kind: 'unknown'; detail: string };
