import type { StepOp } from '../../questions';
import type { RiskClass } from '../../risk';

/**
 * One step of `run`, as it ran. `element` is page text: the act's element as a v1 line, or null for an operation
 * that takes none. `value` is the `--fill` key a TYPE typed (never the value), or the option a SELECT chose.
 */
export interface RunStepReport {
  n: number;
  op: StepOp;
  element: string | null;
  value?: string;
  /** The Decision's confidence in what ran: the target's when it took one, else the operation's. */
  p: number | null;
  risk?: RiskClass;
  /** Whether the look after it differs from the page right before it; null when nothing was sent. */
  page_changed: boolean | null;
  ms: number;
  /**
   * `stale`: the element was not there on the recheck, so nothing was sent and the step was looked at again;
   * `covered`: another element sat over its click point, so nothing was sent (agent-browser 0.27.2+);
   * `unknown`: the act was sent and may or may not have landed; `stopped`: the run stopped at this step.
   */
  verdict?: 'stale' | 'covered' | 'unknown' | 'stopped';
}
