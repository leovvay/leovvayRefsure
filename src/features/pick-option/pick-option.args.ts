import type { Ref } from '../../browser';

/** `pick-option --field @eN --want "<meaning>" [--open --expect-name "<the field's name>"]`. */
export interface PickOptionArgs {
  field: Ref;
  want: string;
  /** Click the field first (a custom dropdown lists its options only once open). */
  open: boolean;
  /** With `--open`, required: the name the field showed; the live ref must still show it before the click. */
  expectName: string | null;
}
