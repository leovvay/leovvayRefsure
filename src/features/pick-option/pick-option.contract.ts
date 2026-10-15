import type { RiskClass } from '../../risk';
import type { Authority } from '../../tickets';

/**
 * `refsure pick-option`: the option that means `--want`, and a ticket for `act --ticket`. A native select gets a
 * ticket for the field, bound to `select` and the option's label; options listed outside the field (a custom
 * listbox) get a ticket for the option itself, bound to `click`. `field` and `option` are page text.
 */
export interface PickOptionResult {
  /** `null` when nothing was picked, or under `--dry-run`. */
  ticket: string | null;
  by: 'code' | 'decision';
  /** The field as a v1 line. */
  field: string;
  /** How many options the field offered. */
  options: number;
  /** The picked option's label. */
  option?: string;
  action?: 'select' | 'click';
  risk?: RiskClass;
  reasons?: string[];
  authority?: Authority;
  /** `--open` clicked the field first. */
  opened?: true;
}
