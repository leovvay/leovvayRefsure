import type { Ref } from '../browser';
import type { Fingerprint } from './fingerprint';

export interface Candidate {
  ref: Ref;
  /** Index into `AxTree.nodes`. */
  node: number;
  /** Line format v1: `<role> "<name>" in="<path>"`. */
  line: string;
  fp: Fingerprint;
}
