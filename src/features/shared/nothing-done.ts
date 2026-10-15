import type { CommandOutcome } from '../../cli';
import type { Next, Status } from '../../output';
import type { ClaimFailure } from '../../tickets';

const RE_OBSERVE: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

/** An outcome where nothing was dispatched (spec §8.1 rule 3): a named cause, and `result` when it says more. */
export function nothingDone<Result>(
  status: Status, cause: string, detail: string, opts: { next?: Next; result?: Result | null } = {},
): CommandOutcome<Result> {
  const outcome: CommandOutcome<Result> = {
    status, acted: false, effect: 'none', result: opts.result ?? null, why: { cause, detail },
  };
  if (opts.next) outcome.next = opts.next;
  return outcome;
}

/** A ticket that cannot be used: spent (`ticket_used`) or past its time (`ticket_expired`); both are `stale`. */
export function ticketGone<Result>(failure: ClaimFailure, id: string): CommandOutcome<Result> {
  const detail = failure === 'ticket_used'
    ? `ticket ${id} was already used, or no such ticket is kept; tickets are single use`
    : `ticket ${id} has expired; tickets live 120 s: locate again`;
  return nothingDone<Result>('stale', failure, detail, { next: RE_OBSERVE });
}

/** A ticket's element moved or left: `page_changed` or `ref_gone`; nothing was done. */
export function recheckStale<Result>(cause: 'page_changed' | 'ref_gone', id: string): CommandOutcome<Result> {
  const detail = cause === 'ref_gone'
    ? `the element of ticket ${id} is no longer on the page; nothing was done`
    : `the page changed since ticket ${id} (another URL, or the element's group, row or place moved); nothing was done`;
  return nothingDone<Result>('stale', cause, detail, { next: RE_OBSERVE });
}
