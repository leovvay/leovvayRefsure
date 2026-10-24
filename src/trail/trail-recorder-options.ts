import type { RunTrace } from '../output';

/** What the recorder is built from, in `main.ts`: the environment (`REFSURE_TRAIL`), the run's trace, the verb. */
export interface TrailRecorderOptions { env: NodeJS.ProcessEnv; trace: RunTrace; command: string }
