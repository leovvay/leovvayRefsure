import type { RefsureConfig } from '../config';
import type { EgressLogEntry } from './egress-log-entry';
import type { EgressRefusal } from './egress-refusal';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Both caps are read from egress.log entries, so every provider call counts, answered or not. A call with
 * no reported cost adds nothing to the day's spend.
 */
export function checkLimits(
  entries: readonly EgressLogEntry[],
  cfg: Pick<RefsureConfig, 'limits'>,
  nowMs: number,
): 'ok' | EgressRefusal {
  const { decisionsPerMinute, usdPerDay } = cfg.limits;
  const lastMinute = entries.filter((entry) => entry.t > nowMs - MINUTE_MS).length;
  if (lastMinute >= decisionsPerMinute) {
    return {
      cause: 'spend_limit',
      detail: `${lastMinute} Decisions in the last 60 s; the limit is ${decisionsPerMinute} per minute`,
    };
  }
  // Summed in micro-dollars: ten calls at $0.05 must reach $0.50, which float addition misses.
  const micros = entries.reduce((sum, entry) => (
    entry.t > nowMs - DAY_MS && typeof entry.usd === 'number' && entry.usd > 0 ? sum + Math.round(entry.usd * 1e6) : sum
  ), 0);
  const spent = micros / 1e6;
  if (micros >= Math.round(usdPerDay * 1e6)) {
    return {
      cause: 'spend_limit',
      detail: `$${spent.toFixed(4)} spent in the last 24 h; the limit is $${usdPerDay} per day`,
    };
  }
  return 'ok';
}
