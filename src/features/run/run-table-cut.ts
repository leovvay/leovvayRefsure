import { stepRowsCut } from '../../questions';
import type { RunState } from './run-state';
import type { RunStop } from './run-stop';

function rows(count: number, what: string): string {
  return `${count} ${what}${count === 1 ? '' : 's'}`;
}

/** The clause's words: the look-alike rows the table left out, the rows the request's fit dropped, or both. */
function cutWords(family: number, fit: number): string {
  if (fit === 0) return rows(family, 'look-alike row');
  if (family === 0) return `${rows(fit, 'row')} to fit the request`;
  return `${rows(family, 'look-alike row')} and ${fit} more to fit the request`;
}

/**
 * A run that ends short of `seen` says when the table its last step Decision read was cut: the look-alike rows
 * `familyCut` left out and the rows the request dropped to fit its bounds. A control the agent expects may be among
 * them, and `refsure snap` lists them. One clause on the stop's detail, envelope only: the request went as it was.
 * Not on `decision_unavailable` (no answer came, or `proposed_only`'s unmeasured family): no model's read of the
 * table was used, so a cut explains nothing.
 */
export function withTableCut(stop: RunStop, run: RunState): RunStop {
  if (stop.verdict === 'seen' || stop.verdict === 'decision_unavailable' || run.asked === null) return stop;
  const { input, familyCut } = run.asked;
  const fit = stepRowsCut(input);
  if (familyCut + fit === 0) return stop;
  return { ...stop, detail: `${stop.detail}; the step's table cut ${cutWords(familyCut, fit)} (refsure snap lists them)` };
}
