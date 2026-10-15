import type { KeySource } from './key-source';

/** One source per provider wire; `null` when the config turns that provider off. */
export interface KeySet { openrouter: KeySource | null; openai: KeySource | null; gateway: KeySource | null }
