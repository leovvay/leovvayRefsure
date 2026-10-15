import type { RunTrace } from '../../output';
import type { AbRun } from './ab-run';

/** What an act on a session needs: the bound runner, and the trace that records the dispatch. */
export interface AbActDeps { run: AbRun; trace: RunTrace }
