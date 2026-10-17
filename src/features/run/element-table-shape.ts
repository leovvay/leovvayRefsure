import type { Candidate } from '../../page-model';
import type { StepFill, StepRow } from '../../questions';

/**
 * One numbered element: its candidate, for a native select the option labels its row offers (in that order), and
 * whether it sits in a dialog.
 */
export interface TableEntry { n: number; cand: Candidate; options: readonly string[]; overlay: boolean }

/**
 * The rows the step Decision is asked over, each row's element by its number, and for each `--fill` the row whose
 * field holds that value now (null when none does).
 */
export interface ElementTable { rows: StepRow[]; byN: ReadonlyMap<number, TableEntry>; placed: (number | null)[] }

/**
 * A value field as the run has settled it (`fieldKey`): a plain `<input>`, whose value a row shows, or one not told
 * apart from an editable region, whose text a row never shows.
 */
export type FieldKind = 'input' | 'withheld';

/**
 * What a table reads beside the page: the goal's and the values' words (`contentWords`) and short numbers (a day,
 * a count), the `--fill` values, and the value fields settled so far (`settleFields` adds to them).
 */
export interface TableHints {
  words: readonly string[];
  numbers: readonly string[];
  fills: readonly StepFill[];
  kinds: Map<string, FieldKind>;
}
