import { loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { nearestRank } from '../lib/stats';

/*
  The 4.3 start gate, as P7 uses it: the phase starts when loadavg1 <= 8 and every host's RTT (median of 20 plain
  requests to the arms file's `rttUrls`, no key) is within 1.5x its P0 baseline; it waits at most 30 minutes, then
  runs anyway and every run carries `high_load` and/or `slow_gateway`. A run is also flagged `high_load` when
  loadavg1 > 12 at its start (`loadFlag`).
*/

export const LOAD_GATE = 8;
export const LOAD_FLAG = 12;
const RTT_FACTOR = 1.5;
const RTT_SAMPLES = 20;
const MAX_WAIT_MS = 30 * 60_000;
const POLL_MS = 30_000;

export function load1(): number {
  return Math.round((loadavg()[0] ?? 0) * 100) / 100;
}

export function loadFlag(load: number): string[] {
  return load > LOAD_FLAG ? ['high_load'] : [];
}

/** Median RTT in ms of `RTT_SAMPLES` sequential GETs; null when the host could not be reached at all. */
export async function rttMedian(url: string): Promise<number | null> {
  const times: number[] = [];
  for (let i = 0; i < RTT_SAMPLES; i += 1) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      await res.arrayBuffer();
      times.push(performance.now() - t0);
    } catch {
      // an unreachable sample is skipped
    }
  }
  return times.length === 0 ? null : nearestRank(times, 0.5);
}

export interface GateResult { flags: string[]; waited_ms: number; load: number; rtt: Record<string, number | null> }

export async function startGate(urls: Readonly<Record<string, string>>, baseline: Readonly<Record<string, number>>, log: (line: string) => void): Promise<GateResult> {
  const started = performance.now();
  for (;;) {
    const load = load1();
    const rtt: Record<string, number | null> = {};
    for (const [host, url] of Object.entries(urls)) rtt[host] = await rttMedian(url);
    const slow = Object.entries(rtt).filter(([host, ms]) => ms === null || (baseline[host] !== undefined && ms > RTT_FACTOR * baseline[host]!));
    const waited = performance.now() - started;
    if (load <= LOAD_GATE && slow.length === 0) return { flags: [], waited_ms: waited, load, rtt };
    if (waited >= MAX_WAIT_MS) {
      return { flags: [...(load > LOAD_GATE ? ['high_load'] : []), ...(slow.length > 0 ? ['slow_gateway'] : [])], waited_ms: waited, load, rtt };
    }
    log(`start gate: loadavg1 ${load}, slow hosts ${slow.map(([h]) => h).join(',') || 'none'}; waiting`);
    await sleep(POLL_MS);
  }
}
