import type { Maturity } from '../../questions';

/** The option picked: by code (the folded label equals `--want`), or by the option-map Decision and its model. */
export type ChosenOption =
  | { at: number; by: 'code' }
  | { at: number; by: 'decision'; confidence: number | null; maturity: Maturity; newFamily: boolean; model: string | null };
