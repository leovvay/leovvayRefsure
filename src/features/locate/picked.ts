import type { Candidate } from '../../page-model';
import type { Maturity } from '../../questions';
import type { AbstainWhy } from '../shared';
import type { LocateTop } from './locate-top';

/** What locate settled on before the twin rule and the risk read: code's pick, the Decision's, or an abstain. */
export type Picked =
  | { kind: 'code'; cand: Candidate; site: 'locate' | 'find' }
  | {
    kind: 'decision'; cand: Candidate; site: 'locate' | 'find'; confidence: number | null; maturity: Maturity;
    newFamily: boolean; model: string | null; top: LocateTop[] | null;
  }
  | { kind: 'abstain'; why: AbstainWhy; top: LocateTop[] | null };
