import type { TypedText } from './typed-text';

/** A step that may carry a value: `do`'s steps, and `run`'s fills (read as `fill`). */
export interface ValueStep { action: string; value?: string }

/** What a run's own values cut: the typed text shape, read from its steps (`valuesOf`), never unread. */
export type Values = Extract<TypedText, { short: readonly string[] }>;
