import type { CalibrationEntry } from '../../../src/questions';
import type { MasksReading } from './masks-reading';

/**
 * The PII masks' own calibration record (spec §7.3): masks on against off for one calibration key, at the rows
 * refsure acts on. fit.ts writes it to calibration.json under `masks`, beside the entries and held sites. refsure
 * never reads it, and the masks stay on by default whatever it says. A later refit of the same key must pass its
 * sets (fit.ts refuses otherwise).
 */
export interface MasksRecord extends Omit<MasksReading, 'sets'> {
  site: CalibrationEntry['site'];
  wordingHash: string;
  lineFormat: 1;
  modelFamily: string;
  provider: CalibrationEntry['provider'];
  /** One hash over the sets below, as an entry's `setSha256`: the set's own sha256 when it is one. */
  setSha256: string;
  /** The sets that asked pages in both modes, with each file's sha256. */
  sets: { set: string; sha256: string }[];
  /** Replays the paired calls came from: separate `run` outputs of those sets. */
  replays: number;
  /** The exact snapshot that answered, and the host it answered through. */
  model: string;
  route: string;
  /** How pages pair, which calls count as acted, and when two modes agree. */
  method: string;
  date: string;
}
