import { appendEgressLog } from '../../egress';
import type { DecisionProvider, ProviderAnswer } from '../../providers';
import type { LogTarget } from './log-target';

/**
 * The provider with every call recorded, whatever its outcome (spec §7.3): one `egress.log` line (sizes, digest,
 * status, cost, model; never content) and one `{host, bytes}` in the trace, which the envelope's `egress` shows.
 */
export function loggedProvider(provider: DecisionProvider, target: LogTarget): DecisionProvider {
  const record = (bytes: number, digest: string, answer: Pick<ProviderAnswer, 'status' | 'usd' | 'model'>): void => {
    const written = appendEgressLog(target.egressLog, {
      t: Date.now(),
      command: target.command,
      site: target.site,
      provider: provider.id,
      host: provider.host,
      bytes,
      digest,
      status: answer.status,
      usd: answer.usd,
      model: answer.model,
    });
    if (!written && !target.trace.notes.includes('egress_log_unwritable')) target.trace.notes.push('egress_log_unwritable');
    target.trace.egress.push({ host: provider.host, bytes });
  };
  return {
    id: provider.id,
    model: provider.model,
    host: provider.host,
    capabilities: provider.capabilities,
    body: (req, opts) => provider.body(req, opts),
    async ask(req, opts) {
      let answer: ProviderAnswer;
      try {
        answer = await provider.ask(req, opts);
      } catch (error) {
        record(req.bytes, req.digest, { status: 'transport', usd: null, model: null });
        throw error;
      }
      record(req.bytes, req.digest, answer);
      return answer;
    },
  };
}
