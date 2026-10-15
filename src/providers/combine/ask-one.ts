import { type AbstainCause, abstainVerdict, type Verdict } from '../../questions';
import type { ProviderAnswer } from '../decision-provider';
import type { PartOutcome } from './combo-outcome';
import type { AskOptions, ComboPart } from './combo-part';
import type { Abstain } from './verdict-kinds';

/** What no later call can heal: the provider refused the key or the account behind it. */
const KEY_REFUSED: ReadonlySet<string> = new Set(['http_401', 'http_402', 'http_403']);

/**
 * Ask one provider and read its answer to the part's question. Never throws: a provider that is slow,
 * failing or unreadable becomes an abstain with `provider_timeout` or `provider_error`.
 */
export async function askOne<Out>(part: ComboPart<Out>, opts: AskOptions): Promise<PartOutcome<Out>> {
  const who = part.provider.id;
  let answer: ProviderAnswer;
  try {
    answer = await part.provider.ask(part.request, {
      deadlineMs: opts.deadlineMs,
      signal: opts.signal,
      ...(part.rendering === undefined ? {} : { rendering: part.rendering }),
    });
  } catch {
    answer = { status: 'transport', answers: null, model: null, usd: null, ms: 0, detail: 'the provider failed' };
  }
  return { provider: who, host: part.provider.host, model: part.provider.model, answer, verdict: verdictOf(part, answer) };
}

function verdictOf<Out>(part: ComboPart<Out>, answer: ProviderAnswer): Verdict<Out> {
  const who = part.provider.id;
  if (answer.status === 'timeout') return unavailable('provider_timeout', labelled(who, answer.detail ?? 'no answer in time'));
  if (answer.status !== 'ok') {
    const failed = unavailable<Out>('provider_error', labelled(who, answer.detail ?? answer.status));
    if (KEY_REFUSED.has(answer.status)) failed.permanent = true;
    return failed;
  }
  const one = answer.answers?.[part.question];
  if (!one) return unavailable('provider_error', labelled(who, `no answer to ${part.question}`));
  try {
    return part.read(one, part.threshold);
  } catch {
    return unavailable('provider_error', labelled(who, 'the answer could not be read'));
  }
}

/** `who: detail`, unless the detail already names its provider. */
export function labelled(who: string, detail: string): string {
  return detail.startsWith(`${who}: `) ? detail : `${who}: ${detail}`;
}

function unavailable<Out>(cause: AbstainCause, detail: string): Abstain<Out> {
  return abstainVerdict(cause, detail);
}
