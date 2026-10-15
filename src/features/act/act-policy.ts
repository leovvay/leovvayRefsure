import type { CommandContext, CommandOutcome } from '../../cli';
import { cutName } from '../../page-model';
import { actionPolicy } from '../../risk';
import { authorityAllows, type RecheckResult, type Ticket } from '../../tickets';
import { highRiskNext, highRiskVia, nothingDone } from '../shared';
import type { ActCommandResult } from './act.contract';
import type { PolicyAct } from './policy-act';

type Fresh = Exclude<RecheckResult, { stale: unknown }>;

/**
 * What the fresh-tree risk allows (spec §6.2, §8.3), checked after the recheck and before any dispatch: money,
 * irreversible, auth and consent never go through `act` (refused, exit 11), and the refusal points to
 * `act-high-risk` (spec §6.3): by the ticket while it is unspent and fit, else by the fresh ref and its name. A
 * risk above the ticket's authority stays a proposal (abstained `proposed_only`, exit 10). `null` lets the act run.
 */
export function policyRefusal(
  ctx: CommandContext, ticket: Ticket, fresh: Fresh, act: PolicyAct, spent: boolean,
): CommandOutcome<ActCommandResult> | null {
  const { risk } = fresh;
  const why = `${risk.class} (${risk.reasons.join(', ')})`;
  if (actionPolicy(act.action, risk.class, 'act') !== 'allow') {
    const { role, name } = ticket.fingerprint;
    // The step names the element: page text, as every place that quotes it.
    ctx.trace.untrusted.add('next.argv');
    const next = highRiskNext({
      class: risk.class,
      via: highRiskVia(spent ? null : ticket, risk.class, fresh.ref, name),
      action: act.action,
      intent: act.intent ?? `${act.action} ${role} ${JSON.stringify(cutName(name))}`,
      ...(act.value === undefined ? {} : { value: act.value }),
    });
    const kept = spent ? 'the ticket is spent' : 'the ticket is kept';
    return nothingDone('refused', 'high_risk_class',
      `${why}: act never acts on money, irreversible, auth or consent; nothing was done (${kept}). `
        + 'Only act-high-risk takes it, and only when the human asked for exactly this', { next });
  }
  if (!authorityAllows(ticket.authority, risk.class)) {
    return nothingDone('abstained', 'proposed_only',
      `the ticket may act at ${ticket.authority === 'none' ? 'no risk' : ticket.authority} only, and the element reads ${why}; `
        + 'nothing was done: confirm it yourself (refsure guard --ticket), then act through outcome',
      { next: { do: 'snapshot', argv: ['refsure', 'snap'] } });
  }
  return null;
}
