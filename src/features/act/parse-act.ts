import type { ActAction } from '../../browser';
import type { ParsedArgs, UsageError } from '../../cli';
import { norm } from '../../page-model';
import { BOUNDS } from '../../questions';
import { isTicketId } from '../../tickets';
import type { ActArgs } from './act.args';

export const ACT_ACTIONS: readonly ActAction[] = ['click', 'dblclick', 'fill', 'select', 'check', 'uncheck'];
export const VALUE_ACTIONS: ReadonlySet<ActAction> = new Set<ActAction>(['fill', 'select']);

function isAction(value: string): value is ActAction {
  return (ACT_ACTIONS as readonly string[]).includes(value);
}

/**
 * `--ticket` is required; `--value` never with an action that takes none; `--verify` is a short intent. A fill or
 * select without `--value` waits for the ticket: pick-option binds its own option (`act --ticket T --action select`).
 */
export function parseAct(raw: ParsedArgs): ActArgs | UsageError {
  if (raw.positionals.length > 0) return { usage: `act takes no positional arguments, got ${raw.positionals.length}` };
  if (raw.rest.length > 0) return { usage: 'act takes nothing after --: the element comes from the ticket' };
  const ticket = typeof raw.values.ticket === 'string' ? raw.values.ticket.trim() : '';
  if (ticket === '') return { usage: 'act needs --ticket T, from locate or dismiss' };
  if (!isTicketId(ticket)) return { usage: '--ticket takes the id locate or dismiss printed (t_…)' };
  let action: ActAction | null = null;
  if (raw.values.action !== undefined) {
    const given = typeof raw.values.action === 'string' ? raw.values.action.trim() : '';
    if (!isAction(given)) return { usage: `--action must be one of ${ACT_ACTIONS.join(', ')}` };
    action = given;
  }
  const value = typeof raw.values.value === 'string' ? raw.values.value : null;
  if (action !== null && !VALUE_ACTIONS.has(action) && value !== null) return { usage: `--action ${action} takes no --value` };
  let verify: string | null = null;
  if (raw.values.verify !== undefined) {
    verify = typeof raw.values.verify === 'string' ? norm(raw.values.verify) : '';
    if (verify === '') return { usage: '--verify is empty: say what should happen, or leave it out' };
    if (verify.length > BOUNDS.INTENT_MAX) return { usage: `--verify is ${verify.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
  }
  const page = typeof raw.values.page === 'string' ? raw.values.page.trim() : null;
  return { ticket, action, value, verify, page };
}
