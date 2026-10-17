import type { StepFill } from '../../questions';

/**
 * `run --goal "<what to get done on this site>" [--fill "<what it is>=<value>"]... [--expect e] [--text t]
 * [--max-steps 25] [--timeout 90s] [--no-dismiss]`.
 */
export interface RunArgs {
  /** The sub-task, in the agent's words; sent to the provider with every step. */
  goal: string;
  /** At most 8, in command-line order: the only text `run` may type. Keys and values are sent to the provider. */
  fills: StepFill[];
  /** What shows once it is done: the done Noul's expectation, on the new text only. */
  expect: string | null;
  /** A literal that ends the run `seen` by code once it is in the new text (`fold`-matched). */
  text: string | null;
  maxSteps: number;
  timeoutMs: number;
  /** Run one dismiss level first (the default); `--no-dismiss` leaves any overlay alone. */
  dismiss: boolean;
}
