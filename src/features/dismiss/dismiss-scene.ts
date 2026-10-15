import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { DismissArgs } from './dismiss.args';

/** One look at an overlay: the page, the snapshot the Decision was asked over, the container and its label. */
export interface DismissScene {
  page: PageRef;
  tab: TabInfo;
  tree: AxTree;
  container: number;
  /** `<role> "<name>"`, page text. */
  overlay: string;
  level: number;
  args: DismissArgs;
}
