import { existsSync, readFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { commandKey } from '../../../src/config';
import { readKey } from '../../../src/providers/read-key';
import type { ArmsFile } from '../lib/arms';
import { nearestRank } from '../lib/stats';

/*
  4.3 start gate and RTT baselines (also 7.3's load rule for timing phases). The RTT baseline of a host is the
  median of 20 plain GETs to the arms file's `rttUrls[host]` (no key, no body: never a model call). P0 saves one
  baseline; a timing phase starts when loadavg1 <= 8 and every host's baseline is within 1.5x of P0's, waits at most
  30 minutes for both, then runs anyway and flags every row `high_load` or `slow_gateway`. A row sent at
  loadavg1 > 12 is flagged `high_load` by itself.
*/

export const RTT_SAMPLES = 20;
export const GATE_LOAD_MAX = 8;
export const ROW_HIGH_LOAD = 12;
export const RTT_FACTOR = 1.5;
export const GATE_WAIT_MS = 30 * 60_000;
const GATE_POLL_MS = 60_000;

export interface RttHost { median: number; samples: number[]; failures: number }
export interface RttBaseline { time: string; arms_sha: string; hosts: Record<string, RttHost> }

/** One GET, timed to the end of the body; NaN when it fails. Redirects are not followed. */
async function oneGet(url: string): Promise<number> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    await res.arrayBuffer();
    return performance.now() - t0;
  } catch {
    return Number.NaN;
  }
}

/** The RTT baseline of every host in the arms file: 20 sequential GETs each, median of those that came back. */
export async function measureRtt(arms: ArmsFile, samples = RTT_SAMPLES): Promise<RttBaseline> {
  // No URL would make every gate pass with nothing measured (a silent skip): refuse instead.
  if (Object.keys(arms.rttUrls).length === 0) throw new Error('the arms file names no rttUrls: the RTT baseline and start gate need one URL per gateway host (4.3)');
  const hosts: Record<string, RttHost> = {};
  for (const [host, url] of Object.entries(arms.rttUrls)) {
    const times: number[] = [];
    let failures = 0;
    for (let i = 0; i < samples; i += 1) {
      const ms = await oneGet(url);
      if (Number.isFinite(ms)) times.push(Math.round(ms * 10) / 10);
      else failures += 1;
    }
    hosts[host] = { median: times.length ? nearestRank(times, 0.5) : Number.NaN, samples: times, failures };
  }
  return { time: new Date().toISOString(), arms_sha: arms.sha, hosts };
}

export function readBaseline(path: string): RttBaseline {
  if (!existsSync(path)) throw new Error(`${path}: no RTT baseline (P0 saves it with \`timing rtt --save\`)`);
  const baseline = JSON.parse(readFileSync(path, 'utf8')) as RttBaseline;
  if (typeof baseline.hosts !== 'object' || baseline.hosts === null || Object.keys(baseline.hosts).length === 0) {
    throw new Error(`${path}: the RTT baseline names no host (the start gate would pass with nothing measured)`);
  }
  return baseline;
}

/**
 * The P0 median per host from the file `timing rtt --save` writes (`hosts.<host>.median`), for the P7 and P8 start
 * gates. A host without a finite median is left out, so the caller's missing-host check refuses it.
 */
export function baselineMedians(path: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [host, entry] of Object.entries(readBaseline(path).hosts)) {
    if (Number.isFinite(entry.median)) out[host] = entry.median;
  }
  return out;
}

/** Hosts whose current median is not within 1.5x of the reference (a failed host counts as slow). */
export function slowHosts(now: RttBaseline, reference: RttBaseline): string[] {
  return Object.keys(reference.hosts).filter((host) => {
    const ref = reference.hosts[host]!.median;
    const cur = now.hosts[host]?.median ?? Number.NaN;
    return !(Number.isFinite(cur) && Number.isFinite(ref) && cur <= RTT_FACTOR * ref);
  });
}

export function load1(): number {
  return Math.round((loadavg()[0] ?? 0) * 100) / 100;
}

export interface GateResult {
  started: string;
  opened: string;
  waited_ms: number;
  passed: boolean;
  load1: number;
  rtt: RttBaseline;
  slow_hosts: string[];
  /** Flags every row of the run carries when the gate did not pass within 30 minutes. */
  flags: string[];
}

/** Waits (polling each minute) until loadavg1 <= 8 and RTT is within 1.5x of P0, at most `maxWaitMs`. */
export async function startGate(arms: ArmsFile, p0: RttBaseline, log: (line: string) => void, maxWaitMs = GATE_WAIT_MS): Promise<GateResult> {
  const t0 = Date.now();
  for (;;) {
    const load = load1();
    const rtt = await measureRtt(arms);
    const slow = slowHosts(rtt, p0);
    const waited = Date.now() - t0;
    const passed = load <= GATE_LOAD_MAX && slow.length === 0;
    if (passed || waited >= maxWaitMs) {
      const flags = passed ? [] : [...(load > GATE_LOAD_MAX ? ['high_load'] : []), ...(slow.length > 0 ? ['slow_gateway'] : [])];
      return { started: new Date(t0).toISOString(), opened: new Date().toISOString(), waited_ms: waited, passed, load1: load, rtt, slow_hosts: slow, flags };
    }
    log(`start gate: loadavg1 ${load}, slow hosts ${slow.length}; waiting (${Math.round(waited / 1000)} s of ${maxWaitMs / 1000})`);
    await sleep(Math.min(GATE_POLL_MS, Math.max(1000, maxWaitMs - waited)));
  }
}

/**
 * 4.3: the extra spawn of a `command` key source, timed alone `runs` times through refsure's own key reader. The
 * value is dropped at once and never printed; only times and whether a key came back are kept.
 */
export async function timeKeySpawn(argv: readonly string[], runs = 20): Promise<{ runs: number; got_key: number; ms: number[]; p50: number; p95: number; max: number }> {
  const source = commandKey(argv);
  const ms: number[] = [];
  let got = 0;
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    const key = await readKey(source);
    ms.push(Math.round((performance.now() - t0) * 10) / 10);
    if (key !== null) got += 1;
  }
  return { runs, got_key: got, ms, p50: nearestRank(ms, 0.5), p95: nearestRank(ms, 0.95), max: Math.max(...ms) };
}
