import type { DoctorCheck } from './doctor-check';

/** `refsure doctor`: every check in order, and the names of the ones that failed. */
export interface DoctorResult { checks: DoctorCheck[]; failed: string[] }
