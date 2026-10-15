import { parseArgs } from 'node:util';
import { ACT_ACTIONS, isActAction, VALUE_ACTIONS } from '../../browser';
import { oneLine, type ParsedArgs, parseRefArg, parseRisk, type UsageError } from '../../cli';
import { BOUNDS } from '../../questions';
import { isMarkId } from '../../tickets';
import type { OutcomeArgs } from './outcome.args';
import type { OutcomeCheck } from './outcome-check';
import type { WrappedAct } from './wrapped-act';

/** Typing has no element-level effect refsure can guard or check (spec §6.2): refused as usage. */
const TYPING: ReadonlySet<string> = new Set(['type', 'keypress', 'press', 'inserttext', 'keyboard']);
const EXPECT_URL_MAX = 2_000;
const SHAPE = '-- <click|dblclick|fill|select|check|uncheck> --element @eN [--value v]';

/** The act after `--`, parsed strictly: one verb, one `--element`, `--value` only for fill and select. */
export function parseWrappedAct(rest: readonly string[]): WrappedAct | UsageError {
  const [verb, ...flags] = rest;
  if (verb === undefined || verb === '') return { usage: `outcome needs the act after --: ${SHAPE}` };
  if (TYPING.has(verb)) {
    return { usage: `outcome does not wrap ${verb}: it wraps ${ACT_ACTIONS.join('|')} (use fill to enter text)` };
  }
  if (!isActAction(verb)) return { usage: `outcome wraps ${ACT_ACTIONS.join('|')}, not ${JSON.stringify(verb.slice(0, 40))}` };
  let values: { element?: string | undefined; value?: string | undefined };
  try {
    const parsed = parseArgs({
      args: flags,
      options: { element: { type: 'string' }, value: { type: 'string' } },
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
    const names = parsed.tokens.flatMap((token) => (token.kind === 'option' ? [token.name] : []));
    const repeated = names.find((name, i) => names.indexOf(name) !== i);
    if (repeated !== undefined) return { usage: `--${repeated} after -- takes one value; it was given more than once` };
    values = parsed.values;
  } catch (error) {
    return { usage: `the act after -- is not ${SHAPE}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const element = parseRefArg(values.element, '--element after --');
  if (typeof element === 'object') return element;
  if (VALUE_ACTIONS.has(verb)) {
    if (values.value === undefined) return { usage: `${verb} needs --value after --` };
    return { action: verb, ref: element, value: values.value };
  }
  if (values.value !== undefined) return { usage: `${verb} takes no --value` };
  return { action: verb, ref: element };
}

function parseCheck(raw: ParsedArgs): OutcomeCheck | UsageError {
  const intent = oneLine(raw.values.intent) ?? '';
  if (intent === '') return { usage: 'outcome needs --intent "<what should happen>"' };
  if (intent.length > BOUNDS.INTENT_MAX) return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  const url = typeof raw.values['expect-url'] === 'string' ? raw.values['expect-url'].trim() : null;
  if (url === '') return { usage: '--expect-url is empty: give a glob such as "*/saved*", or leave it out' };
  if (url !== null && url.length > EXPECT_URL_MAX) return { usage: `--expect-url is over ${EXPECT_URL_MAX} characters` };
  const text = oneLine(raw.values['expect-text']);
  if (text === '') return { usage: '--expect-text is empty: give the text that should appear, or leave it out' };
  if (text !== null && text.length > BOUNDS.INTENT_MAX) {
    return { usage: `--expect-text is ${text.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  return { intent, expectUrl: url, expectText: text };
}

/** Both modes: `--mark M` reads only; otherwise the act after `--` is wrapped and needs `--expect-name`. */
export function parseOutcome(raw: ParsedArgs): OutcomeArgs | UsageError {
  if (raw.positionals.length > 0) {
    return { usage: `outcome takes no positional arguments before --, got ${raw.positionals.length}` };
  }
  const check = parseCheck(raw);
  if ('usage' in check) return check;
  if (raw.values.mark !== undefined) {
    const mark = typeof raw.values.mark === 'string' ? raw.values.mark.trim() : '';
    if (raw.rest.length > 0) return { usage: 'outcome takes --mark or an act after --, not both' };
    if (raw.values['expect-name'] !== undefined || raw.values.risk !== undefined) {
      return { usage: '--expect-name and --risk guard a wrapped act; with --mark nothing is acted on' };
    }
    if (!isMarkId(mark)) return { usage: '--mark takes the id `refsure mark` printed (m_…)' };
    return { mode: 'mark', ...check, mark };
  }
  if (raw.rest.length === 0) return { usage: `outcome needs --mark M, or the act to wrap after --: ${SHAPE}` };
  const act = parseWrappedAct(raw.rest);
  if ('usage' in act) return act;
  const expectName = oneLine(raw.values['expect-name']) ?? '';
  if (expectName === '') return { usage: 'outcome needs --expect-name "<the name you saw on the element>"' };
  if (expectName.length > BOUNDS.INTENT_MAX) {
    return { usage: `--expect-name is ${expectName.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  const risk = parseRisk(raw.values.risk);
  if (typeof risk === 'object') return risk;
  return { mode: 'wrap', ...check, expectName, ...(risk === undefined ? {} : { risk }), act };
}
