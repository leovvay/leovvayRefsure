import type { AxTree, PageRef, Ref, TabInfo } from '../../browser';
import type { FieldOptions } from './field-options';
import type { PickOptionResult } from './pick-option.contract';

/** One look at the field: the page, its snapshot, the field node and ref, its options, and the result so far. */
export interface OptionScene {
  page: PageRef;
  tab: TabInfo;
  tree: AxTree;
  field: number;
  fieldRef: Ref;
  found: FieldOptions;
  want: string;
  result: PickOptionResult;
}
