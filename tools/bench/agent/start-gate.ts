import { loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { readArmsFile } from '../lib/arms';
import { baselineMedians } from '../timing/gate';
import { nearestRank } from '../lib/stats';

/*
  The 4.3 start gate, which P8 starts under (7.1): loadavg1 <= 8 and, per host of the arms file's `rttUrls`, the
  median of 20 requests within 1.5x its P0 baseline. It waits at most 30 minutes, then runs anyway and every row
  carries `high_load` or `slow_gateway`. A row whose run starts at loadavg1 > 12 is flagged `high_load` (7.3).
*/

export const GATE_LOAD = 8;
export const HIGH_LOAD = 12;
const RTT_FACTOR = 1.5;
const RTT_SAMPLES = 20;
const WAIT_MS = 30 * 60_000;
const POLL_MS = 60_000;

export interface GateResult { passed: boolean; waited_ms: number; loadavg1: number; rtt: Record<string, number>; flags: string[] }

async function rttMedian(url: string): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < RTT_SAMPLES; i += 1) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
      await res.arrayBuffer();
      times.push(performance.now() - t0);
    } catch {
      times.push(Number.POSITIVE_INFINITY);
    }
  }
  return nearestRank(times, 0.5);
}

/** Baseline file: the P0 RTT file `timing rtt --save` writes; every arms-file host must have a median in it. */
export async function startGate(baselinePath: string, log: (line: string) => void): Promise<GateResult> {
  const baseline = baselineMedians(baselinePath);
  const urls = readArmsFile().rttUrls;
  const missing = Object.keys(urls).filter((host) => baseline[host] === undefined);
  if (missing.length > 0) throw new Error(`${baselinePath}: no P0 RTT median for ${missing.join(', ')}`);
  const start = performance.now();
  for (;;) {
    const load = loadavg()[0] ?? 0;
    const rtt: Record<string, number> = {};
    for (const [host, url] of Object.entries(urls)) rtt[host] = await rttMedian(url);
    const slow = Object.entries(rtt).filter(([host, ms]) => baseline[host] !== undefined && ms > RTT_FACTOR * baseline[host]!);
    const waited = performance.now() - start;
    if (load <= GATE_LOAD && slow.length === 0) return { passed: true, waited_ms: waited, loadavg1: load, rtt, flags: [] };
    if (waited >= WAIT_MS) {
      const flags = [...(load > GATE_LOAD ? ['high_load'] : []), ...(slow.length > 0 ? ['slow_gateway'] : [])];
      return { passed: false, waited_ms: waited, loadavg1: load, rtt, flags };
    }
    log(`start gate: loadavg1 ${load.toFixed(2)}, slow hosts ${slow.length}; waiting`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
