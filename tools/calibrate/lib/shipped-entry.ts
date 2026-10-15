import type { CalibrationEntry } from '../../../src/questions';
import type { CalibrationProvenance } from './calibration-provenance';

/** A calibration.json entry as the fit writes it: refsure's entry plus the provenance people read. */
export interface ShippedEntry extends CalibrationEntry {
  provenance: CalibrationProvenance;
}
