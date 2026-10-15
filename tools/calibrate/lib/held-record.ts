import type { CalibrationEntry, Maturity } from '../../../src/questions';
import type { NativeProvenance } from './native-provenance';

/**
 * A site the fit read but does not ship as `measured`, kept in calibration.json beside the entries (under
 * `held`) so its evidence and reading stay on record. refsure never reads it: the site keeps its declared
 * maturity and rows. A later refit of the same key must pass every set named here (fit.ts refuses otherwise).
 */
export interface HeldRecord {
  site: CalibrationEntry['site'];
  wordingHash: string;
  lineFormat: 1;
  modelFamily: string;
  provider: CalibrationEntry['provider'];
  /** What refsure uses instead: the site's declared maturity and starting rows. */
  ships: { maturity: Maturity; rows: CalibrationEntry['threshold'] };
  /** Why the site is not measured: the fit gave no row, or the site is held for an owner ruling. */
  why: string;
  date: string;
  /** The fit on every labelled call given for this key, pooled over sets and replays. */
  pooled: NativeProvenance;
  /** The Orca-native replay's reading alone, when the pool also holds converted sets. */
  native?: NativeProvenance;
  /** An entry this record replaced: its rows, sets and date. */
  replaced?: { threshold: unknown; set: string; n: number; date: string };
}
