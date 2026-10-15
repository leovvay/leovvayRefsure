import { oneLine, type ParsedArgs, type UsageError } from '../../cli';
import { fold } from '../../page-model';
import { BOUNDS } from '../../questions';
import type { StateArgs } from './state.args';

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const STATES_MIN = 2;
const STATES_MAX = 12;

/** `key="<when>"` pairs, in the order given: snake-case keys, each once, never `none`, descriptions not empty. */
function parseStates(given: readonly string[]): { states: Record<string, string> } | UsageError {
  if (given.length < STATES_MIN) return { usage: `--state needs at least ${STATES_MIN} states, got ${given.length}` };
  if (given.length > STATES_MAX) return { usage: `--state takes at most ${STATES_MAX} states, got ${given.length}` };
  const states: Record<string, string> = {};
  for (const pair of given) {
    const at = pair.indexOf('=');
    const key = at === -1 ? '' : pair.slice(0, at).trim();
    if (!KEY.test(key)) {
      return { usage: `--state takes key="<when the page is in it>", the key in snake_case (a-z, 0-9, _): got ${JSON.stringify(pair.slice(0, 40))}` };
    }
    if (fold(key) === 'none') return { usage: '--state may not name a state none: it is reserved for "no option fits"' };
    if (Object.hasOwn(states, key)) return { usage: `--state ${key} is given twice` };
    const description = oneLine(pair.slice(at + 1)) ?? '';
    if (description === '') return { usage: `--state ${key} has no description: say when the page is in it` };
    if (description.length > BOUNDS.DESCRIPTION_MAX) {
      return { usage: `--state ${key} is ${description.length} characters; keep it to ${BOUNDS.DESCRIPTION_MAX}` };
    }
    states[key] = description;
  }
  return { states };
}

/** `--expect` alone (the research set), or `--state` two or more times (a custom set), `--expect` then optional. */
export function parseState(raw: ParsedArgs): StateArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `state takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'state takes nothing after --' };
  let expect: string | null = null;
  if (raw.values.expect !== undefined) {
    expect = oneLine(raw.values.expect) ?? '';
    if (expect === '') return { usage: '--expect is empty: say what the intended page is' };
    if (expect.length > BOUNDS.INTENT_MAX) return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  const given = raw.values.state;
  if (given === undefined) {
    if (expect === null) return { usage: 'state needs --expect "<what the intended page is>", or --state key="<when>" two or more times' };
    return { expect, states: null };
  }
  const list = Array.isArray(given) ? given : typeof given === 'string' ? [given] : [];
  const parsed = parseStates(list);
  if ('usage' in parsed) return parsed;
  return { expect, states: parsed.states };
}
