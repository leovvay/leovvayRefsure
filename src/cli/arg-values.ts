import { isRef, type PageHint, type Ref } from '../browser';
import { norm } from '../page-model';
import { RISK_ORDER, type RiskClass } from '../risk';
import { isTicketId } from '../tickets';
import type { ParsedArgs } from './parsed-args';
import type { UsageError } from './usage-error';

/*
  The flag values several verbs share, parsed one way: the same flag reads the same in every verb, and a refusal
  says the same thing wherever it comes from.
*/

const TICKET_SOURCES = 'the id locate, dismiss or pick-option printed (t_…)';

/** Free text as a verb reads it: `norm`ed (NFKC, spacing collapsed, trimmed); `null` when the flag is absent. */
export function oneLine(value: unknown): string | null {
  return typeof value === 'string' ? norm(value) : null;
}

/** `--risk`: one of the risk classes, or absent. */
export function parseRisk(value: unknown): RiskClass | undefined | UsageError {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (RISK_ORDER as readonly string[]).includes(value)) return value as RiskClass;
  return { usage: `--risk must be one of ${RISK_ORDER.join(', ')}` };
}

/** A ref flag (`--ref`, `--field`, `--element`): `@eN` or `eN` from the agent's latest snapshot. */
export function parseRefArg(value: unknown, flag: string): Ref | UsageError {
  if (typeof value !== 'string' || value.trim() === '') return { usage: `${flag} needs @eN from your latest snapshot` };
  const ref = value.trim().replace(/^@/, '');
  if (!isRef(ref)) return { usage: `${flag} must look like @e12, got ${JSON.stringify(value.slice(0, 40))}` };
  return ref;
}

/** `--ticket`: the id a ticket-issuing verb printed. */
export function parseTicketArg(value: unknown): string | UsageError {
  const ticket = typeof value === 'string' ? value.trim() : '';
  if (ticket === '') return { usage: `--ticket needs ${TICKET_SOURCES}` };
  if (!isTicketId(ticket)) return { usage: `--ticket takes ${TICKET_SOURCES}` };
  return ticket;
}

/** `--page`, trimmed; `null` when absent. A blank one never gets here: parsing refuses it. */
export function parsePageArg(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

/** The page hint from `--page`, as every verb and the registry read it. */
export function hintOf(raw: ParsedArgs): PageHint {
  const page = parsePageArg(raw.values.page);
  return page === null ? {} : { page };
}
