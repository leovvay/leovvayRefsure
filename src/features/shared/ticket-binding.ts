import type { ActAction } from '../../browser';
import type { CommandOutcome } from '../../cli';
import type { Ticket } from '../../tickets';
import { nothingDone } from './nothing-done';

/**
 * A ticket issued for one action and value (pick-option binds select and its option) runs only those: another
 * `--action` or `--value` is a usage error, never a quiet swap. `action` is null when none was given. `valueHint`
 * ends the value refusal: what the caller can do instead. The value itself is never quoted. `null`: it fits.
 */
export function ticketBindingRefusal<Result>(
  ticket: Ticket, action: ActAction | null, value: string | null, valueHint: string,
): CommandOutcome<Result> | null {
  if (action !== null && ticket.action !== undefined && action !== ticket.action) {
    return nothingDone('usage', 'usage', `ticket ${ticket.id} was issued for ${ticket.action}, not ${action}`);
  }
  if (value !== null && ticket.value !== undefined && value !== ticket.value) {
    return nothingDone('usage', 'usage', `ticket ${ticket.id} was issued with its own value: ${valueHint}`);
  }
  return null;
}
