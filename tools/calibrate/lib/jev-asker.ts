import { setTimeout as sleep } from 'node:timers/promises';
import { keySet, loadConfig } from '../../../src/config';
import { approve, isEgressRefusal } from '../../../src/egress';
import { makeProviders } from '../../../src/providers';
import type { DecisionProvider } from '../../../src/providers';
import type { JevAnswer } from './jev-answer';
import type { JevAsker } from './jev-asker-shape';

/*
  refsure's own Jev path, as a Decision takes it: the config and key sources from $XDG_CONFIG_HOME/refsure, the
  egress pipeline (`approve`: consent, redaction, PII masks, byte bounds) and the Jev provider. Calibration calls
  are not written to egress.log and do not count toward its caps: the harness is not a Decision a command made.
*/

const RETRYABLE = /^(timeout|transport|http_429|http_5\d\d)$/;

/** Each call is tried once, then again after a retryable failure, up to `attempts` tries in all. */
export function jevAsker(opts: { deadlineMs: number; attempts: number }): JevAsker {
  const config = loadConfig(process.env);
  const provider: DecisionProvider | undefined = makeProviders(config, keySet(config, process.env)).jev;
  if (!provider) throw new Error('no Jev provider: set REFSURE_OPENROUTER_KEY (or a gateway naming Jev) first');
  return {
    host: provider.host,
    model: provider.model,
    approve(site, request, piiMasks) {
      const masked = piiMasks === undefined ? config : { ...config, piiMasks };
      const approved = approve(request, {
        site, provider: 'jev', host: provider.host, originUrl: null, profileId: null, config: masked,
        dryRun: false, nowMs: Date.now(), egressLog: [],
      });
      return isEgressRefusal(approved) ? { cause: approved.cause, detail: approved.detail } : approved;
    },
    async ask(request) {
      for (let attempt = 1; ; attempt += 1) {
        const signal = AbortSignal.timeout(opts.deadlineMs + 1000);
        const answer = await provider.ask(request, { deadlineMs: opts.deadlineMs, signal });
        const result: JevAnswer = {
          status: answer.status, answers: answer.answers, model: answer.model, usd: answer.usd, ms: answer.ms,
          attempts: attempt, digest: request.digest, ...(answer.detail === undefined ? {} : { detail: answer.detail }),
        };
        if (answer.status === 'ok' || !RETRYABLE.test(answer.status) || attempt >= opts.attempts) return result;
        await sleep(1000 * attempt * attempt);
      }
    },
  };
}
