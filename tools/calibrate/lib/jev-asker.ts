import { setTimeout as sleep } from 'node:timers/promises';
import { keySet, loadConfig } from '../../../src/config';
import type { RefsureConfig } from '../../../src/config';
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

/** `piiMasks` overrides the config (parity sends the stored bodies unmasked, as they were sent). */
export function jevAsker(opts: { deadlineMs: number; attempts: number; piiMasks?: boolean }): JevAsker {
  const loaded = loadConfig(process.env);
  const config: RefsureConfig = opts.piiMasks === undefined ? loaded : { ...loaded, piiMasks: opts.piiMasks };
  const provider: DecisionProvider | undefined = makeProviders(config, keySet(config, process.env)).jev;
  if (!provider) throw new Error('no Jev provider: set REFSURE_OPENROUTER_KEY (or a gateway naming Jev) first');
  return {
    host: provider.host,
    model: provider.model,
    approve(site, request) {
      const approved = approve(request, {
        site, provider: 'jev', host: provider.host, originUrl: null, profileId: null, config,
        dryRun: false, nowMs: Date.now(), egressLog: [],
      });
      return isEgressRefusal(approved) ? { cause: approved.cause, detail: approved.detail } : approved;
    },
    async ask(request) {
      let last: JevAnswer | null = null;
      for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
        const signal = AbortSignal.timeout(opts.deadlineMs + 1000);
        const answer = await provider.ask(request, { deadlineMs: opts.deadlineMs, signal });
        last = {
          status: answer.status, answers: answer.answers, model: answer.model, usd: answer.usd, ms: answer.ms,
          attempts: attempt, digest: request.digest, ...(answer.detail === undefined ? {} : { detail: answer.detail }),
        };
        if (answer.status === 'ok' || !RETRYABLE.test(answer.status)) return last;
        await sleep(1000 * attempt * attempt);
      }
      return last!;
    },
  };
}
