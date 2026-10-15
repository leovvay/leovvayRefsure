import type { ActAction, Ref } from '../../browser';
import type { Next } from '../../output';
import { cutName } from '../../page-model';
import { BOUNDS } from '../../questions';
import type { RiskClass } from '../../risk';
import { type Ticket, ticketUnfit } from '../../tickets';
import type { HighRiskVia } from './high-risk-via';

const BY_TICKET: ReadonlySet<RiskClass> = new Set<RiskClass>(['money', 'irreversible']);

/**
 * The path a high-risk act takes (spec §6.3): an unspent ticket fit for it (≥0.85 or code-settled, no twins) for
 * money and irreversible; else the fresh ref and its name, the only path auth and consent may take.
 */
export function highRiskVia(ticket: Ticket | null, cls: RiskClass, ref: Ref, name: string): HighRiskVia {
  if (ticket !== null && BY_TICKET.has(cls) && ticketUnfit(ticket) === null) return { ticket: ticket.id };
  return { ref, expectName: cutName(name) };
}

/**
 * The refusal's way on (spec §6.3): the one command that may take money, irreversible, auth or consent, spelled
 * out. A filled value is never echoed (it may be a password): a fill's argv omits it and needs `--value` added.
 * Only a human's ask makes it right to run; no Decision ever confirms it.
 */
export function highRiskNext(opts: {
  class: RiskClass; via: HighRiskVia; action: ActAction; intent: string; value?: string;
}): Next {
  const via = 'ticket' in opts.via
    ? ['--ticket', opts.via.ticket]
    : ['--ref', `@${opts.via.ref}`, '--expect-name', opts.via.expectName];
  const value = opts.action === 'select' && opts.value !== undefined ? ['--value', opts.value] : [];
  const intent = cutName(opts.intent, BOUNDS.INTENT_MAX);
  return {
    do: 'act_high_risk',
    argv: ['refsure', 'act-high-risk', '--class', opts.class, ...via, '--action', opts.action, ...value, '--intent', intent],
  };
}
