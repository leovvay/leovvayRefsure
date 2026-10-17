import { oneLine, type ParsedArgs, type UsageError } from '../../cli';
import { fold, valuePieces } from '../../page-model';
import { BOUNDS, type StepFill } from '../../questions';
import { durationOf } from '../wait-for';
import type { RunArgs } from './run.args';

export const FILLS_MAX = 8;
export const RUN_DEFAULTS = { maxSteps: 25, timeout: '90s' } as const;
/** A goal is a sub-task in a sentence or two. */
export const GOAL_MAX = 600;
const KEY_MAX = 80;
const STEPS_MAX = 60;
const TIMEOUT_BOUNDS = { minMs: 5_000, maxMs: 600_000 } as const;

/**
 * One `--fill "<what it is>=<value>"`, split at the first `=`. The value is never empty and never quoted in a
 * refusal: the agent may have passed something it should not have.
 */
function fillOf(given: string): StepFill | UsageError {
  const at = given.indexOf('=');
  if (at === -1) return { usage: '--fill takes "<what it is>=<value>": no "=" was given' };
  const key = oneLine(given.slice(0, at)) ?? '';
  if (key === '') return { usage: '--fill names nothing before "=": say what the value is ("destination=Brussels")' };
  if (key.length > KEY_MAX) return { usage: `--fill's name before "=" is ${key.length} characters; keep it to ${KEY_MAX}` };
  const value = given.slice(at + 1);
  if (value.trim() === '') return { usage: `--fill names no value after "=" for ${JSON.stringify(key)}` };
  if (value.length > BOUNDS.INTENT_MAX) {
    return { usage: `--fill's value for ${JSON.stringify(key)} is over ${BOUNDS.INTENT_MAX} characters` };
  }
  return { key, value };
}

function fillsOf(raw: ParsedArgs): StepFill[] | UsageError {
  const given = raw.values.fill;
  const list = given === undefined ? [] : Array.isArray(given) ? given : [String(given)];
  if (list.length > FILLS_MAX) return { usage: `run takes at most ${FILLS_MAX} --fill values, got ${list.length}` };
  const fills: StepFill[] = [];
  for (const text of list) {
    const fill = fillOf(text);
    if ('usage' in fill) return fill;
    if (fills.some((other) => fold(other.key) === fold(fill.key))) {
      return { usage: `--fill names ${JSON.stringify(fill.key)} twice: give each value its own name` };
    }
    fills.push(fill);
  }
  return fills;
}

function maxStepsOf(value: unknown): number | UsageError {
  if (value === undefined) return RUN_DEFAULTS.maxSteps;
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > STEPS_MAX) {
    return { usage: `--max-steps must be a whole number from 1 to ${STEPS_MAX}` };
  }
  return n;
}

/** `--text` never holds a `--fill` value: the values are cut from the new text before it is read. */
function textRefusal(text: string, fills: readonly StepFill[]): UsageError | null {
  const literal = fold(text);
  if (!valuePieces(fills.map((fill) => fill.value)).some((piece) => literal.includes(fold(piece)))) return null;
  return { usage: '--text holds a --fill value, which is cut from the new text before --text is read: '
    + 'give a literal the page shows only once it is done' };
}

/** `--goal` is required; `--fill` at most 8 with distinct names; `--text` holds no `--fill` value. */
export function parseRun(raw: ParsedArgs): RunArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `run takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'run takes nothing after --' };
  const goal = oneLine(raw.values.goal) ?? '';
  if (goal === '') return { usage: 'run needs --goal "<what to get done on this site>"' };
  if (goal.length > GOAL_MAX) return { usage: `--goal is ${goal.length} characters; keep it to ${GOAL_MAX}` };
  const fills = fillsOf(raw);
  if ('usage' in fills) return fills;
  const expect = oneLine(raw.values.expect);
  if (expect === '') return { usage: '--expect is empty: say what shows once it is done, or leave it out' };
  if (expect !== null && expect.length > BOUNDS.DESCRIPTION_MAX) {
    return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.DESCRIPTION_MAX}` };
  }
  const text = oneLine(raw.values.text);
  if (text === '') return { usage: '--text is empty: give the literal to look for, or leave it out' };
  if (text !== null && text.length > BOUNDS.INTENT_MAX) return { usage: `--text is over ${BOUNDS.INTENT_MAX} characters` };
  const echo = text === null ? null : textRefusal(text, fills);
  if (echo !== null) return echo;
  const maxSteps = maxStepsOf(raw.values['max-steps']);
  if (typeof maxSteps !== 'number') return maxSteps;
  const timeout = typeof raw.values.timeout === 'string' ? raw.values.timeout : RUN_DEFAULTS.timeout;
  const timeoutMs = durationOf('timeout', timeout, TIMEOUT_BOUNDS.minMs, TIMEOUT_BOUNDS.maxMs);
  if (typeof timeoutMs !== 'number') return timeoutMs;
  return { goal, fills, expect, text, maxSteps, timeoutMs, dismiss: raw.values['no-dismiss'] !== true };
}
