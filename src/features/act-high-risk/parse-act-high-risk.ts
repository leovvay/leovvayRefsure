import { type ActAction, isRef } from '../../browser';
import type { ParsedArgs, UsageError } from '../../cli';
import { norm } from '../../page-model';
import { BOUNDS } from '../../questions';
import { HIGH_RISK, type RiskClass } from '../../risk';
import { isTicketId } from '../../tickets';
import type { ActHighRiskArgs, HighRiskTarget } from './act-high-risk.args';

export const HIGH_RISK_ACTIONS: readonly ActAction[] = ['click', 'dblclick', 'fill', 'select', 'check', 'uncheck'];
export const VALUE_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select']);
const CLASSES = [...HIGH_RISK];
/** Spec §6.3: auth and consent go only by a live ref, never by a ticket. */
const REF_ONLY: ReadonlySet<RiskClass> = new Set<RiskClass>(['auth', 'consent']);

function text(value: unknown): string | null {
  return typeof value === 'string' ? norm(value) : null;
}

function parseTarget(raw: ParsedArgs, cls: RiskClass): HighRiskTarget | UsageError {
  const ticket = typeof raw.values.ticket === 'string' ? raw.values.ticket.trim() : null;
  const given = raw.values.ref;
  const expectName = text(raw.values['expect-name']);
  if (ticket !== null && (given !== undefined || expectName !== null)) {
    return { usage: 'act-high-risk takes --ticket T or --ref @eN --expect-name n, not both' };
  }
  if (ticket !== null) {
    if (!isTicketId(ticket)) return { usage: '--ticket takes the id locate, dismiss or pick-option printed (t_…)' };
    if (REF_ONLY.has(cls)) return { usage: `${cls} goes only by --ref @eN --expect-name n, never by a ticket` };
    return { kind: 'ticket', ticket };
  }
  if (typeof given !== 'string' || given.trim() === '') return { usage: 'act-high-risk needs --ticket T or --ref @eN --expect-name n' };
  const ref = given.trim().replace(/^@/, '');
  if (!isRef(ref)) return { usage: `--ref must look like @e12, got ${JSON.stringify(given.slice(0, 40))}` };
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
  if (!(HIGH_RISK_ACTIONS as readonly string[]).includes(action)) {
    return { usage: `act-high-risk needs --action, one of ${HIGH_RISK_ACTIONS.join(', ')}` };
  }
  const typed = action as ActAction;
  const value = typeof raw.values.value === 'string' ? raw.values.value : null;
  // A ticket from pick-option carries its own value; every other fill or select needs one here.
  if (value !== null && !VALUE_ACTIONS.has(typed)) return { usage: `--action ${typed} takes no --value` };
  if (value === null && VALUE_ACTIONS.has(typed) && target.kind === 'ref') return { usage: `--action ${typed} needs --value` };
  const intent = text(raw.values.intent) ?? '';
  if (intent === '') return { usage: 'act-high-risk needs --intent "<what the human asked for>"' };
  if (intent.length > BOUNDS.INTENT_MAX) return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  const page = typeof raw.values.page === 'string' ? raw.values.page.trim() : null;
  return { class: cls as RiskClass, target, action: typed, value, intent, hint: page === null ? {} : { page } };
}
