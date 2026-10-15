import type { ActAction, Ref } from '../../browser';
import type { Next } from '../../output';
import { BOUNDS } from '../../questions';
import type { RiskClass } from '../../risk';
import { type Ticket, ticketUnfit } from '../../tickets';
import { argText } from './arg-text';
import type { HighRiskVia } from './high-risk-via';

const BY_TICKET: ReadonlySet<RiskClass> = new Set<RiskClass>(['money', 'irreversible']);

/**
 * The path a high-risk act takes (spec §6.3): an unspent ticket fit for it (≥0.85 or code-settled, no twins) for
 * money and irreversible; else the fresh ref and its full name, the only path auth and consent may take.
 */
export function highRiskVia(ticket: Ticket | null, cls: RiskClass, ref: Ref, name: string): HighRiskVia {
  if (ticket !== null && BY_TICKET.has(cls) && ticketUnfit(ticket) === null) return { ticket: ticket.id };
  return { ref, expectName: name };
}

/**
 * The refusal's way on (spec §6.3): the one command that may take money, irreversible, auth or consent, spelled
 * out so it runs as given. A filled value is never echoed (it may be a password): a fill's argv omits it and needs
 * `--value` added. `risk` is the raise the refusing step read (its `--risk`, or the ticket's class): a live ref
 * carries no ticket, so the argv passes it on as `--risk`, and act-high-risk reads the same class. Only a human's
 * ask makes it right to run; no Decision ever confirms it. Free text (a name, a label, the intent) goes inline as
 * `--opt=<text>`: strict `parseArgs` refuses a separate value that starts with `-`, such as "-5% Pay now".
 */
export function highRiskNext(opts: {
  class: RiskClass; via: HighRiskVia; action: ActAction; intent: string; value?: string; risk?: RiskClass;
}): Next {
  const via = 'ticket' in opts.via
    ? ['--ticket', opts.via.ticket]
    : ['--ref', `@${opts.via.ref}`, `--expect-name=${argText(opts.via.expectName, BOUNDS.INTENT_MAX)}`];
  const raise = 'ref' in opts.via && opts.risk !== undefined && opts.risk !== 'read' ? ['--risk', opts.risk] : [];
  const value = opts.action === 'select' && opts.value !== undefined ? [`--value=${opts.value}`] : [];
  return {
    do: 'act_high_risk',
    argv: [
      'refsure', 'act-high-risk', '--class', opts.class, ...via, '--action', opts.action, ...value, ...raise,
      `--intent=${argText(opts.intent, BOUNDS.INTENT_MAX)}`,
    ],
  };
}
