import { VALUE_ACTIONS } from '../../browser';
import { oneLine, type OptionToken, type ParsedArgs, type UsageError } from '../../cli';
import { norm } from '../../page-model';
import { BOUNDS } from '../../questions';
import { durationOf } from '../wait-for';
import type { DoArgs } from './do.args';
import type { DoStep, StepAction } from './do-step';

/** The step options, in `--help` order. */
export const STEP_ACTIONS: readonly StepAction[] = ['fill', 'select', 'check', 'uncheck', 'click'];
export const STEPS_MAX = 8;
export const DO_DEFAULTS = { timeout: '60s', stall: '10s' } as const;
const DURATION_MIN_MS = 1_000;
const DURATION_MAX_MS = 600_000;

function isStepAction(name: string): name is StepAction {
  return (STEP_ACTIONS as readonly string[]).includes(name);
}

/** A target as `locate --intent` takes it: one line, not empty, at most 300 characters. */
function targetOf(flag: string, text: string, what: string): string | UsageError {
  const target = oneLine(text) ?? '';
  if (target === '') return { usage: `--${flag} names no ${what}` };
  if (target.length > BOUNDS.INTENT_MAX) return { usage: `--${flag}'s ${what} is ${target.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  return target;
}

/**
 * One step from its token. A fill or select is `<field>=<value>`, split at the first `=`, so the value may hold
 * more. A refusal never quotes the value: it may be a password.
 */
function stepOf(token: OptionToken & { name: StepAction }): DoStep | UsageError {
  const action = token.name;
  const given = token.value ?? '';
  if (!VALUE_ACTIONS.has(action)) {
    const target = targetOf(action, given, action === 'click' ? 'control' : 'box');
    return typeof target === 'string' ? { action, target } : target;
  }
  const at = given.indexOf('=');
  const shape = action === 'fill' ? '"<field>=<value>"' : '"<field>=<option label>"';
  if (at === -1) return { usage: `--${action} takes ${shape}: no "=" was given` };
  const target = targetOf(action, given.slice(0, at), 'field before "="');
  if (typeof target !== 'string') return target;
  const value = given.slice(at + 1);
  if (action === 'select' && norm(value) === '') return { usage: '--select names no option after "="' };
  return { action, target, value };
}

/** The steps in command-line order (`tokens`); `values` cannot tell how `--fill` and `--click` interleave. */
function stepsOf(tokens: readonly OptionToken[]): DoStep[] | UsageError {
  const steps: DoStep[] = [];
  for (const token of tokens) {
    const { name } = token;
    if (!isStepAction(name)) continue;
    const step = stepOf({ ...token, name });
    if ('usage' in step) return step;
    steps.push(step);
  }
  if (steps.length > STEPS_MAX) return { usage: `do takes at most ${STEPS_MAX} steps, got ${steps.length}: split the task in two` };
  return steps;
}

/** A duration flag that only the wait reads: refused without `--expect`, where it would mean nothing. */
function waitDuration(raw: ParsedArgs, name: 'timeout' | 'stall', expect: string | null): number | UsageError {
  const given = raw.values[name];
  if (given !== undefined && expect === null) return { usage: `--${name} needs --expect: without it nothing is waited for` };
  const text = typeof given === 'string' ? given : DO_DEFAULTS[name];
  return durationOf(name, text, DURATION_MIN_MS, DURATION_MAX_MS);
}

/** At least one step or `--expect`; `--text`, `--timeout` and `--stall` only with `--expect`. */
export function parseDo(raw: ParsedArgs): DoArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `do takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'do takes nothing after --' };
  const steps = stepsOf(raw.tokens);
  if ('usage' in steps) return steps;
  const expect = oneLine(raw.values.expect);
  if (expect === '') return { usage: '--expect is empty: say what should show after the steps, or leave it out' };
  if (expect !== null && expect.length > BOUNDS.DESCRIPTION_MAX) {
    return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.DESCRIPTION_MAX}` };
  }
  if (steps.length === 0 && expect === null) {
    return { usage: `do needs a step (${STEP_ACTIONS.map((a) => `--${a}`).join(', ')}) or --expect` };
  }
  const text = oneLine(raw.values.text);
  if (text === '') return { usage: '--text is empty: give the literal to look for, or leave it out' };
  if (text !== null && expect === null) return { usage: '--text needs --expect: it is the code rule of the wait' };
  if (text !== null && text.length > BOUNDS.INTENT_MAX) return { usage: `--text is over ${BOUNDS.INTENT_MAX} characters` };
  const timeoutMs = waitDuration(raw, 'timeout', expect);
  if (typeof timeoutMs !== 'number') return timeoutMs;
  const stallMs = waitDuration(raw, 'stall', expect);
  if (typeof stallMs !== 'number') return stallMs;
  return { steps, expect, text, timeoutMs, stallMs, dismiss: raw.values['no-dismiss'] !== true };
}
