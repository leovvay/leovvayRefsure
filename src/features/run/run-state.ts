import type { PageRef } from '../../browser';
import { describeElement, type Fingerprint } from '../../page-model';
import type { DismissLevelReport } from '../dismiss';
import type { Values } from '../shared';
import type { TableHints } from './element-table-shape';
import type { RunArgs } from './run.args';
import type { BlockerReport, RunResult } from './run.contract';
import type { RunLook } from './run-look-shape';
import type { RunStepReport } from './run-step-report';
import type { RaiserProbe } from './step-act-shape';
import type { RunTiming } from './run-timing';

/** One run in progress: what it was asked, what it has done, and the look the next step reads. */
export interface RunState {
  args: RunArgs;
  page: PageRef;
  /** What the element table reads beside the page: the goal's and the values' words, and the values. */
  hints: TableHints;
  values: Values;
  /** The page's lines when the run began (after the blocker level); `newReading` keeps it current. */
  baseline: Set<string>;
  started: number;
  steps: RunStepReport[];
  /** Every step as one line, oldest first; the Decision reads the last 8. */
  recent: string[];
  acted: boolean;
  /** Acts in a row after which the page showed nothing new. */
  unchanged: number;
  /** How many times each act (operation, element, value) was sent. */
  repeats: Map<string, number>;
  /** The field the last step typed into, while PRESS_ENTER may follow it. */
  typed: Fingerprint | null;
  /** The step that last typed each `--fill`, by its index: a dialog may hide the field it went into. */
  typedAt: Map<number, number>;
  /** The field each `--fill` was last seen in, by its index, as `role "name"`: a dialog may hide it since. */
  seenIn: Map<number, string>;
  dismissed: DismissLevelReport | null;
  /** The blocker levels after step 1 (`blockerLevel`). */
  blockers: BlockerReport[];
  /** Every overlay a blocker level has worked on, as `role "name"`, the first level's too: each gets one. */
  tried: Set<string>;
  current: RunLook;
  /** The raiser count taken while the current look's Decision was asked, for the guard (`probeRaisers`). */
  probe: RaiserProbe | null;
  /** The envelope's `new_text`: the last look's new lines. */
  shown: string[];
  /** Where each step's time goes, with `REFSURE_RUN_TIMING=1` (`runTiming`); a no-op otherwise. */
  timing: RunTiming;
}

/** The result so far, its verdict set by whoever ends the run. */
export function resultOf(run: RunState, now: number, decisions: number): RunResult {
  return {
    verdict: 'budget', steps: run.steps, dismissed: run.dismissed, ...(run.blockers.length > 0 ? { blockers: run.blockers } : {}),
    new_text: run.shown, url: run.current.tab.url, elapsed_ms: now - run.started, decisions,
  };
}

/** A step's line as the Decision reads it in `recent`: what ran, on what, and what came of it. Never a value. */
export function recentLine(report: RunStepReport, element: { role: string; name: string } | null, outcome: string): string {
  const on = element === null ? '' : ` ${describeElement(element.role, element.name)}`;
  const value = report.value === undefined ? '' : ` ← ${report.value}`;
  return `${report.n}. ${report.op}${on}${value}: ${outcome}`;
}

/** What the page did after a step, in `recent`'s words. */
export function changeWords(changed: boolean | null): string {
  if (changed === null) return 'nothing was sent';
  return changed ? 'the page changed' : 'the page did not change';
}

/** A `--fill` value no field shows and no step typed. */
export const NOT_TYPED = 'not typed yet';
/** How a value a field of the look shows is placed: `in [3]`. Only such a value is offered no TYPE. */
export const IN_ROW = 'in [';

/**
 * Where each `--fill` value is, for the Decision: in a field the look shows, typed at a step, shown in a field an
 * earlier look had (a dialog may cover it now), or not typed yet. A value no field of the look shows may be typed
 * (again: a page can drop it), and the Decision reads where it went before.
 */
export function placedOf(run: RunState): string[] {
  const { table } = run.current;
  return run.args.fills.map((_, k) => {
    const row = table.placed[k];
    const entry = row === null || row === undefined ? undefined : table.byN.get(row);
    if (entry !== undefined) {
      run.seenIn.set(k, describeElement(entry.cand.fp.role, entry.cand.fp.name));
      return `${IN_ROW}${entry.n}]`;
    }
    const step = run.typedAt.get(k);
    if (step !== undefined) return `typed at step ${step}; no field shows it now`;
    const seen = run.seenIn.get(k);
    return seen === undefined ? NOT_TYPED : `in ${seen}, shown earlier`;
  });
}
