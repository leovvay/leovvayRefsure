import type { RefsureConfig } from '../config';
import type { EgressLogEntry } from './egress-log-entry';
import type { EgressRefusal } from './egress-refusal';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/**
 * What a call with no reported cost is charged against `usdPerDay`, in micro-dollars: the top of the measured
 * per-Decision cost (spec §10). OpenAI publishes no price and a gateway may report none, and a cap that skipped
 * those calls would never bind them.
 */
const UNPRICED_CALL_MICROS = 100;

/**
 * The micro-dollars one logged call counts for: its reported cost, or the estimate when it reported none and may
 * have reached a model. A `transport` failure never arrived, and an `http_*` answer was refused or shed before one.
 */
function chargeOf(entry: EgressLogEntry): { micros: number; estimated: boolean } {
  if (typeof entry.usd === 'number') return { micros: entry.usd > 0 ? Math.round(entry.usd * 1e6) : 0, estimated: false };
  const reachedModel = entry.status !== 'transport' && !entry.status.startsWith('http_');
  return reachedModel ? { micros: UNPRICED_CALL_MICROS, estimated: true } : { micros: 0, estimated: false };
}

/**
 * Both caps are read from egress.log entries, so every provider call counts, answered or not. `pending` counts the
 * calls the same Decision makes alongside this one (an `agree` asks both providers at once): none of them is in
 * the log yet, and each still counts. A call with no reported cost counts at `UNPRICED_CALL_MICROS`.
 */
export function checkLimits(
  entries: readonly EgressLogEntry[],
  cfg: Pick<RefsureConfig, 'limits'>,
  nowMs: number,
  pending = 0,
): 'ok' | EgressRefusal {
  const { decisionsPerMinute, usdPerDay } = cfg.limits;
  const lastMinute = entries.filter((entry) => entry.t > nowMs - MINUTE_MS).length;
  if (lastMinute + pending >= decisionsPerMinute) {
    const alongside = pending > 0 ? ` plus ${pending} more in this Decision` : '';
    return {
      cause: 'spend_limit',
      detail: `${lastMinute} Decisions in the last 60 s${alongside}; the limit is ${decisionsPerMinute} per minute`,
    };
  }
  // Summed in micro-dollars: ten calls at $0.05 must reach $0.50, which float addition misses.
  let micros = 0;
  let estimated = 0;
  for (const entry of entries) {
    if (entry.t <= nowMs - DAY_MS) continue;
    const charge = chargeOf(entry);
    micros += charge.micros;
    if (charge.estimated) estimated += 1;
  }
  if (micros >= Math.round(usdPerDay * 1e6)) {
    const unpriced = estimated > 0
      ? ` (${estimated} calls reported no cost and count at $${UNPRICED_CALL_MICROS / 1e6} each)`
      : '';
    return {
      cause: 'spend_limit',
      detail: `$${(micros / 1e6).toFixed(4)} spent in the last 24 h${unpriced}; the limit is $${usdPerDay} per day`,
    };
  }
  return 'ok';
}
