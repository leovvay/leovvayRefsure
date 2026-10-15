import type { Ref } from '../../browser';

/** `pick-option --field @eN --want "<meaning>" [--open]`. */
export interface PickOptionArgs {
  field: Ref;
  want: string;
  /** Click the field first (a custom dropdown lists its options only once open). */
  open: boolean;
}
