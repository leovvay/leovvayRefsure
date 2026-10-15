import type { ActAction } from '../../browser';
import type { CommandOutcome } from '../../cli';
import { actionPolicy, type RiskReading } from '../../risk';
import { authorityAllows, type Ticket } from '../../tickets';
import { nothingDone } from '../shared';
import type { ActCommandResult } from './act.contract';

/**
 * What the fresh-tree risk allows (spec §6.2, §8.3), checked after the recheck and before any dispatch: money,
 * irreversible, auth and consent never go through `act` (refused, exit 11); a risk above the ticket's authority
 * stays a proposal (abstained `proposed_only`, exit 10). `null` lets the act run.
 */
export function policyRefusal(ticket: Ticket, risk: RiskReading, action: ActAction): CommandOutcome<ActCommandResult> | null {
  const why = `${risk.class} (${risk.reasons.join(', ')})`;
  if (actionPolicy(action, risk.class, 'act') !== 'allow') {
    return nothingDone('refused', 'high_risk_class',
      `${why}: act never acts on money, irreversible, auth or consent; nothing was done`, { next: { do: 'needs_human' } });
  }
  if (!authorityAllows(ticket.authority, risk.class)) {
    return nothingDone('abstained', 'proposed_only',
      `the ticket may act at ${ticket.authority === 'none' ? 'no risk' : ticket.authority} only, and the element reads ${why}; `
        + 'nothing was done: confirm it yourself (refsure guard --ticket), then act through outcome',
      { next: { do: 'snapshot', argv: ['refsure', 'snap'] } });
  }
  return null;
}
