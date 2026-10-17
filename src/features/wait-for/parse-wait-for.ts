import { oneLine, type ParsedArgs, type UsageError } from '../../cli';
import { BOUNDS } from '../../questions';
import { formatDuration, parseDuration } from './duration';
import type { WaitForArgs } from './wait-for.args';

export const DEFAULTS = { timeout: '30s', interval: '2s', maxDecisions: '10' } as const;
/** A wait's `--timeout` and `--stall`, here and in `do`: from 1 s to 10 m. */
export const WAIT_BOUNDS = { minMs: 1_000, maxMs: 600_000 } as const;
const INTERVAL_MIN_MS = 1_000;
const INTERVAL_MAX_MS = 300_000;
const MAX_DECISIONS_LIMIT = 100;
const URL_GLOB_MAX = 2_000;

function stringOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function durationOf(name: string, text: string, min: number, max: number): number | UsageError {
  const ms = parseDuration(text);
  if (ms === null) return { usage: `--${name} takes a duration such as 500ms, 30s or 2m, got ${JSON.stringify(text.slice(0, 20))}` };
  if (ms < min || ms > max) return { usage: `--${name} must be from ${formatDuration(min)} to ${formatDuration(max)}` };
  return ms;
}

/** `--stall`: off when absent, else a duration from 1 s to 10 m. */
export function stallOf(value: unknown): number | null | UsageError {
  if (value === undefined) return null;
  return durationOf('stall', stringOf(value, ''), WAIT_BOUNDS.minMs, WAIT_BOUNDS.maxMs);
}

/**
 * `wait-for`'s options, checked: durations `\d+(ms|s|m)`, an interval of at least 1 s, a bounded call cap, and
 * something that can settle the wait (a Decision, `--text` or `--url`). `--stall` is off unless given, and shorter
 * than `--timeout` when it is: a stall the timeout always comes before could never end the wait.
 */
export function parseWaitFor(raw: ParsedArgs): WaitForArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `wait-for takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'wait-for takes nothing after --' };
  const expect = oneLine(raw.values.expect) ?? '';
  if (expect === '') return { usage: 'wait-for needs --expect "<what should appear>"' };
  if (expect.length > BOUNDS.DESCRIPTION_MAX) {
    return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.DESCRIPTION_MAX}` };
  }
  const text = oneLine(raw.values.text);
  if (text === '') return { usage: '--text is empty: give the literal to look for, or leave it out' };
  if (text !== null && text.length > BOUNDS.INTENT_MAX) return { usage: `--text is over ${BOUNDS.INTENT_MAX} characters` };
  const url = typeof raw.values.url === 'string' ? raw.values.url.trim() : null;
  if (url === '') return { usage: '--url is empty: give a glob such as "*/done*", or leave it out' };
  if (url !== null && url.length > URL_GLOB_MAX) return { usage: `--url is over ${URL_GLOB_MAX} characters` };

  const timeoutMs = durationOf('timeout', stringOf(raw.values.timeout, DEFAULTS.timeout), WAIT_BOUNDS.minMs, WAIT_BOUNDS.maxMs);
  if (typeof timeoutMs !== 'number') return timeoutMs;
  const intervalMs = durationOf('interval', stringOf(raw.values.interval, DEFAULTS.interval), INTERVAL_MIN_MS, INTERVAL_MAX_MS);
  if (typeof intervalMs !== 'number') return intervalMs;
  const capText = stringOf(raw.values['max-decisions'], DEFAULTS.maxDecisions).trim();
  const maxDecisions = /^\d{1,3}$/.test(capText) ? Number(capText) : Number.NaN;
  if (!Number.isInteger(maxDecisions) || maxDecisions > MAX_DECISIONS_LIMIT) {
    return { usage: `--max-decisions must be a whole number from 0 to ${MAX_DECISIONS_LIMIT}` };
  }
  // With no Decision and no code rule, nothing could ever see it: the wait would only run out.
  if (maxDecisions === 0 && text === null && url === null) {
    return { usage: '--max-decisions 0 leaves nothing to see it: give --text or --url, or allow at least 1 Decision' };
  }
  const stallMs = stallOf(raw.values.stall);
  if (typeof stallMs === 'object' && stallMs !== null) return stallMs;
  if (stallMs !== null && stallMs >= timeoutMs) {
    return { usage: `--stall ${formatDuration(stallMs)} is not shorter than --timeout ${formatDuration(timeoutMs)}, so it `
      + 'could never end the wait: raise --timeout too' };
  }
  return { expect, text, url, timeoutMs, intervalMs, maxDecisions, agree: raw.values.agree === true, stallMs };
}
