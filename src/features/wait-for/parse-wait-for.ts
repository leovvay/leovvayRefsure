import type { ParsedArgs, UsageError } from '../../cli';
import { norm } from '../../page-model';
import { BOUNDS } from '../../questions';
import { formatDuration, parseDuration } from './duration';
import type { WaitForArgs } from './wait-for.args';

export const DEFAULTS = { timeout: '30s', interval: '2s', maxDecisions: '10' } as const;
const TIMEOUT_MAX_MS = 600_000;
const INTERVAL_MIN_MS = 1_000;
const INTERVAL_MAX_MS = 300_000;
const MAX_DECISIONS_LIMIT = 100;
const URL_GLOB_MAX = 2_000;

function stringOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function durationOf(name: string, text: string, min: number, max: number): number | UsageError {
  const ms = parseDuration(text);
  if (ms === null) return { usage: `--${name} takes a duration such as 500ms, 30s or 2m, got ${JSON.stringify(text.slice(0, 20))}` };
  if (ms < min || ms > max) return { usage: `--${name} must be from ${formatDuration(min)} to ${formatDuration(max)}` };
  return ms;
}

/** `wait-for`'s options, checked: durations `\d+(ms|s|m)`, an interval of at least 1 s, a bounded call cap. */
export function parseWaitFor(raw: ParsedArgs): WaitForArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `wait-for takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'wait-for takes nothing after --' };
  const expect = typeof raw.values.expect === 'string' ? norm(raw.values.expect) : '';
  if (expect === '') return { usage: 'wait-for needs --expect "<what should appear>"' };
  if (expect.length > BOUNDS.DESCRIPTION_MAX) {
    return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.DESCRIPTION_MAX}` };
  }
  const text = typeof raw.values.text === 'string' ? norm(raw.values.text) : null;
  if (text === '') return { usage: '--text is empty: give the literal to look for, or leave it out' };
  if (text !== null && text.length > BOUNDS.INTENT_MAX) return { usage: `--text is over ${BOUNDS.INTENT_MAX} characters` };
  const url = typeof raw.values.url === 'string' ? raw.values.url.trim() : null;
  if (url === '') return { usage: '--url is empty: give a glob such as "*/done*", or leave it out' };
  if (url !== null && url.length > URL_GLOB_MAX) return { usage: `--url is over ${URL_GLOB_MAX} characters` };

  const timeoutMs = durationOf('timeout', stringOf(raw.values.timeout, DEFAULTS.timeout), INTERVAL_MIN_MS, TIMEOUT_MAX_MS);
  if (typeof timeoutMs !== 'number') return timeoutMs;
  const intervalMs = durationOf('interval', stringOf(raw.values.interval, DEFAULTS.interval), INTERVAL_MIN_MS, INTERVAL_MAX_MS);
  if (typeof intervalMs !== 'number') return intervalMs;
  const capText = stringOf(raw.values['max-decisions'], DEFAULTS.maxDecisions).trim();
  const maxDecisions = /^\d{1,3}$/.test(capText) ? Number(capText) : Number.NaN;
  if (!Number.isInteger(maxDecisions) || maxDecisions > MAX_DECISIONS_LIMIT) {
    return { usage: `--max-decisions must be a whole number from 0 to ${MAX_DECISIONS_LIMIT}` };
  }
  return { expect, text, url, timeoutMs, intervalMs, maxDecisions, agree: raw.values.agree === true };
}
