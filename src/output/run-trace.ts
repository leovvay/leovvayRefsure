import type { DecisionInfo, EgressEntry } from './envelope';
import type { TrailWhy } from './trail-why';

/** One per invocation: decide() and the browser adapter write into it; the registry reads it into the envelope. */
export interface RunTrace {
  /** The envelope shows the last one. */
  decisions: DecisionInfo[];
  /** The envelope shows `null` when empty. */
  egress: EgressEntry[];
  /** Set by any snapshot: refs the agent held before this call may be renumbered. */
  snapshotTaken: boolean;
  /** Set once an act was handed to the browser, whatever came back. */
  dispatched: boolean;
  /** JSON paths inside `result` that hold page text. */
  untrusted: Set<string>;
  /** Filled only under `--dry-run`: the exact bodies that would have been sent. */
  dryRun: { provider: string; host: string; body: unknown }[];
  /** Notes the registry may surface, e.g. a refused state-file mode. */
  notes: string[];
  /**
   * Why the next act is taken, set by a feature right before it when the last Decision is not the act's own reason
   * (a ticket's pick, `run`'s step held to its risk row). The trail reads it at that act and clears it; the envelope
   * never reads it.
   */
  trailWhy?: TrailWhy;
}
