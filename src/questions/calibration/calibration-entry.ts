import type { ProviderId, SiteId } from '../site-id';
import type { CalibrationProvenance } from './calibration-provenance';

/** One measured threshold with its provenance; shipped in calibration.json (spec §9). */
export interface CalibrationEntry {
  site: SiteId;
  wordingHash: string;
  lineFormat: 1;
  modelFamily: string;
  provider: ProviderId;
  threshold: number | { yesAtLeast: number; noAtMost: number } | Record<string, number>;
  setSha256: string;
  n: number;
  coverageAtP99: number;
  precisionAtP99: number;
  date: string;
  provenance?: CalibrationProvenance;
}
