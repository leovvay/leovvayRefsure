import type { CalibItem } from './calib-item';
import type { CodeRow } from './code-row';

/**
 * One capture's result: an item to ask (with how many lines were offered, and whether the gold element was left
 * out of them so only `none` can be right), or a row code settled or the replay dropped.
 */
export type Captured =
  | { kind: 'ask'; item: CalibItem; offered: number; goldNotOffered: boolean }
  | { kind: 'row'; row: CodeRow };
