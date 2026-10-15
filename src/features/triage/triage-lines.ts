import type { ConsoleLine, NetworkLine } from '../../browser';
import { boundText, cleanEgressText } from '../../egress';
import { bareUrl } from '../mark';
import type { TriageConsole } from './triage-console';
import type { TriageRequest } from './triage-request';

/** At most this many lines in all (spec §6.3), console and network together. */
export const TRIAGE_MAX = 50;
const TEXT_MAX = 300;
const URL_MAX = 300;
const KEPT_LEVELS: ReadonlySet<string> = new Set(['error', 'warning', 'warn', 'assert']);

/** Errors and warnings only. The text is redacted and masked (masks always on, as a mark keeps it), then cut. */
export function consoleLines(lines: readonly ConsoleLine[]): (TriageConsole & { at: number | null })[] {
  return lines
    .filter((line) => KEPT_LEVELS.has(line.level.toLowerCase()))
    .map((line) => ({
      level: line.level.toLowerCase(),
      text: boundText(cleanEgressText(line.text, true), { max: TEXT_MAX, inline: true }),
      at: line.at,
    }));
}

/** Failed requests only: status ≥400, or 0 (no response at all). */
export function networkLines(lines: readonly NetworkLine[]): (TriageRequest & { at: number | null })[] {
  return lines
    .filter((line) => line.status >= 400 || line.status === 0)
    .map((line) => ({ method: line.method.toUpperCase().slice(0, 16), url: bareUrl(line.url, { max: URL_MAX }), status: line.status, at: line.at }));
}

/** Lines at or after `sinceMs`; a line with no time is kept, and the caller says so. */
export function sinceFilter<T extends { at: number | null }>(lines: readonly T[], sinceMs: number | null): T[] {
  return sinceMs === null ? [...lines] : lines.filter((line) => line.at === null || line.at >= sinceMs);
}

/**
 * Both lists under one cap, the latest of each kept: each kind gets half, and room one leaves goes to the other.
 * `dropped` counts what was left out.
 */
export function capLines<C, N>(cons: readonly C[], net: readonly N[]): { console: C[]; network: N[]; dropped: number } {
  const half = TRIAGE_MAX / 2;
  const netKeep = Math.min(net.length, Math.max(half, TRIAGE_MAX - cons.length));
  const conKeep = Math.min(cons.length, TRIAGE_MAX - netKeep);
  return {
    console: conKeep > 0 ? cons.slice(-conKeep) : [],
    network: netKeep > 0 ? net.slice(-netKeep) : [],
    dropped: cons.length - conKeep + net.length - netKeep,
  };
}
