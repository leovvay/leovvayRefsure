import type { Next, Status } from '../../output';
import type { RunVerdict } from './run.contract';

/**
 * Why `run` stopped: its verdict, the cause and detail `why` gives, and the way on. `status` is the cause's own
 * when absent; `effect` says the last act's own effect when it may not have landed; `byCode` marks a `--text` end.
 */
export interface RunStop {
  verdict: RunVerdict;
  cause: string;
  detail: string;
  next?: Next;
  status?: Status;
  effect?: 'dispatched' | 'unknown';
  byCode?: true;
}
