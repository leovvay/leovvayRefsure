import { ACT_ACTIONS, type ActAction, isActAction, VALUE_ACTIONS } from '../../browser';
import { oneLine, type ParsedArgs, parsePageArg, parseTicketArg, type UsageError } from '../../cli';
import { BOUNDS } from '../../questions';
import type { ActArgs } from './act.args';

/**
 * `--ticket` is required; `--value` never with an action that takes none; `--verify` is a short intent. A fill or
 * select without `--value` waits for the ticket: pick-option binds its own option (`act --ticket T --action select`).
 */
export function parseAct(raw: ParsedArgs): ActArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `act takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'act takes nothing after --: the element comes from the ticket' };
  const ticket = parseTicketArg(raw.values.ticket);
  if (typeof ticket === 'object') return ticket;
  let action: ActAction | null = null;
  if (raw.values.action !== undefined) {
    const given = typeof raw.values.action === 'string' ? raw.values.action.trim() : '';
    if (!isActAction(given)) return { usage: `--action must be one of ${ACT_ACTIONS.join(', ')}` };
    action = given;
  }
  const value = typeof raw.values.value === 'string' ? raw.values.value : null;
  if (action !== null && !VALUE_ACTIONS.has(action) && value !== null) return { usage: `--action ${action} takes no --value` };
  let verify: string | null = null;
  if (raw.values.verify !== undefined) {
    verify = oneLine(raw.values.verify) ?? '';
    if (verify === '') return { usage: '--verify is empty: say what should happen, or leave it out' };
    if (verify.length > BOUNDS.INTENT_MAX) return { usage: `--verify is ${verify.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  return { ticket, action, value, verify, page: parsePageArg(raw.values.page) };
}
