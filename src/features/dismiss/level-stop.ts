import type { Next } from '../../output';
import type { DismissLevelReport } from './dismiss-level-report';
import type { LevelOutcome } from './level-outcome';

/** A level that stopped before any click: its report names the cause, and `why` says it. */
export function stop(report: DismissLevelReport, status: LevelOutcome['status'], cause: string, detail: string, next: Next): LevelOutcome {
  return { report: { ...report, cause }, status, why: { cause, detail }, next, clicked: false };
}
