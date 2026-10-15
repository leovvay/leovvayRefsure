import { randomUUID } from 'node:crypto';
import { appendEgressLog, type EgressLogEntry } from '../../egress';
import type { DecisionProvider, ProviderAnswer } from '../../providers';
import type { LogTarget } from './log-target';

/**
 * The provider with every call recorded, whatever its outcome (spec §7.3): `egress.log` lines (sizes, digest, status,
 * cost, model; never content) and one `{host, bytes}` in the trace, which the envelope's `egress` shows.
 *
 * A call is reserved before it is sent (`pending`) and settled after, under one call id, so the caps see calls in
 * flight in other refsure processes, and a call cut off by a kill still counts. A call refused before anything left
 * (`unsent`) settles as such: it counts nowhere and shows no egress.
 */
export function loggedProvider(provider: DecisionProvider, target: LogTarget): DecisionProvider {
  const append = (line: Omit<EgressLogEntry, 'command' | 'site' | 'provider' | 'host'>): void => {
    const written = appendEgressLog(target.egressLog, {
      command: target.command, site: target.site, provider: provider.id, host: provider.host, ...line,
    });
    if (!written && !target.trace.notes.includes('egress_log_unwritable')) target.trace.notes.push('egress_log_unwritable');
  };
  const settle = (call: string, bytes: number, digest: string, answer: Pick<ProviderAnswer, 'status' | 'usd' | 'model' | 'unsent'>): void => {
    const status = answer.unsent ? 'unsent' : answer.status;
    append({ t: Date.now(), bytes, digest, status, usd: answer.usd, model: answer.model, call });
    if (!answer.unsent) target.trace.egress.push({ host: provider.host, bytes });
  };
  return {
    id: provider.id,
    model: provider.model,
    host: provider.host,
    body: (req, opts) => provider.body(req, opts),
    async ask(req, opts) {
      const call = randomUUID();
      append({ t: Date.now(), bytes: req.bytes, digest: req.digest, status: 'pending', usd: null, model: null, call });
      let answer: ProviderAnswer;
      try {
        answer = await provider.ask(req, opts);
      } catch (error) {
        settle(call, req.bytes, req.digest, { status: 'transport', usd: null, model: null });
        throw error;
      }
      settle(call, req.bytes, req.digest, answer);
      return answer;
    },
  };
}
