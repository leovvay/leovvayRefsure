/** What `act` re-finds an element by on a fresh snapshot (spec §8.3). */
export interface Fingerprint {
  role: string;
  /** `norm`ed. */
  name: string;
  path: string;
  /** 1-based index within the twin group, in snapshot-text order. */
  ordinal: number;
  /** Twin group size. */
  twins: number;
}
