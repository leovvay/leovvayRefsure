import type { RiskClass } from '../../risk';
import type { Authority } from '../../tickets';

/** One overlay's turn. `overlay` and `control` are page text. */
export interface DismissLevelReport {
  level: number;
  verdict: 'dismissed' | 'proposed' | 'no_overlay' | 'vetoed' | 'abstained' | 'refused' | 'stale' | 'unknown';
  /** The container, as `<role> "<name>"`. */
  overlay?: string;
  /** The pick, as a v1 line. */
  control?: string;
  by?: 'code' | 'decision';
  risk?: RiskClass;
  authority?: Authority;
  /** A proposal's ticket, for `act --ticket` after a look. */
  ticket?: string;
  /** Why this level stopped short of a dismissal. */
  cause?: string;
}
