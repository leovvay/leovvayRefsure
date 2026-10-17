/** What one step of `run` may do; only the ones the page allows are offered. */
export type StepOp = 'CLICK' | 'TYPE' | 'SELECT' | 'PRESS_ENTER' | 'SCROLL_DOWN' | 'WAIT' | 'DONE' | 'BLOCKED';

/** The element an operation's own head picked: a row, with the `--fill` (0-based) or the option it pairs. */
export type StepTarget =
  | { op: 'CLICK'; n: number; p: number }
  | { op: 'TYPE'; n: number; fill: number; p: number }
  | { op: 'SELECT'; n: number; option: number; p: number };

/**
 * The step Decision read: the leading operation and its confidence, the target its own head picked (null for an
 * operation that takes none), and the done Noul's answer when `--expect` asked it. At the presence edge `done`
 * ends the run whatever operation leads, so a reading with `done` there carries no target.
 */
export interface StepReading {
  op: StepOp;
  p: number;
  target: StepTarget | null;
  done: number | null;
}
