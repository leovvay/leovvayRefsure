import type { RiskClass } from '../../risk';
import type { Authority } from '../../tickets';
import type { LocateTop } from './locate-top';

/**
 * `refsure locate`: the pick, its ticket and what `act` may do with it. On an abstain only what explains it is
 * set (`line` and `rows` for twins, `top` when asked). `line`, `rows` and `top` are page text.
 */
export interface LocateResult {
  /** `null` when nothing was picked, the pick is propose-only by family, or under `--dry-run`. */
  ticket: string | null;
  by: 'code' | 'decision';
  /** The pick as a v1 line. */
  line?: string;
  ordinal?: number;
  twins?: number;
  risk?: RiskClass;
  reasons?: string[];
  authority?: Authority;
  /** Twins: the row text of each member of the group, in page order, for `--within`. */
  rows?: string[];
  top?: LocateTop[];
  note?: string;
}
