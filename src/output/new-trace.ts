import type { RunTrace } from './run-trace';

export function newTrace(): RunTrace {
  return {
    decisions: [],
    egress: [],
    snapshotTaken: false,
    dispatched: false,
    untrusted: new Set(),
    dryRun: [],
    notes: [],
  };
}
