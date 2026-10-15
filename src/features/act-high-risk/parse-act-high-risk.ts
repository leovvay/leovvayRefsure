import { ACT_ACTIONS, isActAction, VALUE_ACTIONS } from '../../browser';
import {
  hintOf, oneLine, type ParsedArgs, parseRefArg, parseRisk, parseTicketArg, type UsageError,
} from '../../cli';
import { BOUNDS } from '../../questions';
import { HIGH_RISK, type RiskClass } from '../../risk';
import type { ActHighRiskArgs, HighRiskTarget } from './act-high-risk.args';

const CLASSES = [...HIGH_RISK];
/** Spec §6.3: auth and consent go only by a live ref, never by a ticket. */
const REF_ONLY: ReadonlySet<RiskClass> = new Set<RiskClass>(['auth', 'consent']);

function parseTarget(raw: ParsedArgs, cls: RiskClass): HighRiskTarget | UsageError {
  const given = raw.values.ref;
  const expectName = oneLine(raw.values['expect-name']);
  if (raw.values.ticket !== undefined) {
    if (given !== undefined || expectName !== null) {
      return { usage: 'act-high-risk takes --ticket T or --ref @eN --expect-name n, not both' };
    }
    const ticket = parseTicketArg(raw.values.ticket);
    if (typeof ticket === 'object') return ticket;
    if (REF_ONLY.has(cls)) return { usage: `${cls} goes only by --ref @eN --expect-name n, never by a ticket` };
    return { kind: 'ticket', ticket };
  }
  if (given === undefined) return { usage: 'act-high-risk needs --ticket T or --ref @eN --expect-name n' };
  const ref = parseRefArg(given, '--ref');
  if (typeof ref === 'object') return ref;
  if (expectName === null || expectName === '') return { usage: '--ref needs --expect-name "<the name you saw on the element>"' };
  if (expectName.length > BOUNDS.INTENT_MAX) return { usage: `--expect-name is over ${BOUNDS.INTENT_MAX} characters` };
  return { kind: 'ref', ref, expectName };
}

/**
 * Every rule that the command line alone can break: the class is one of the four high-risk ones, the element is
 * named one way, auth and consent never by ticket, the action is typed, `--value` goes with fill and select only,
 * and `--intent` says what the human asked for.
 */
export function parseActHighRisk(raw: ParsedArgs): ActHighRiskArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `act-high-risk takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'act-high-risk takes nothing after --' };
  const cls = typeof raw.values.class === 'string' ? raw.values.class.trim() : '';
  if (!(CLASSES as string[]).includes(cls)) return { usage: `--class must be one of ${CLASSES.join(', ')}` };
  const target = parseTarget(raw, cls as RiskClass);
  if ('usage' in target) return target;
  const action = typeof raw.values.action === 'string' ? raw.values.action.trim() : '';
  if (!isActAction(action)) return { usage: `act-high-risk needs --action, one of ${ACT_ACTIONS.join(', ')}` };
  const value = typeof raw.values.value === 'string' ? raw.values.value : null;
  // A ticket from pick-option carries its own value; every other fill or select needs one here.
  if (value !== null && !VALUE_ACTIONS.has(action)) return { usage: `--action ${action} takes no --value` };
  if (value === null && VALUE_ACTIONS.has(action) && target.kind === 'ref') return { usage: `--action ${action} needs --value` };
  const intent = oneLine(raw.values.intent) ?? '';
  if (intent === '') return { usage: 'act-high-risk needs --intent "<what the human asked for>"' };
  if (intent.length > BOUNDS.INTENT_MAX) return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  const risk = parseRisk(raw.values.risk);
  if (typeof risk === 'object') return risk;
  return {
    class: cls as RiskClass, target, action, value, intent, hint: hintOf(raw),
    ...(risk === undefined ? {} : { risk }),
  };
}
