import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ProviderId } from '../../../src/questions';

/*
  7.3 runaway guards. Each guard stops or pauses by itself and writes one line (time, guard, value, action) into
  `<results>/<phase>/guards.jsonl`. A stop that binds every runner is a `<results>/STOP` file every runner checks
  before each row; no guard is lifted without a dated note in the run log (delete STOP by hand).
*/

/** 7.2 list prices per input token: Jev $0.042 / M, OpenAI Decisions $0.10 / M. */
export const PRICE_PER_INPUT_TOKEN: Readonly<Record<ProviderId, number>> = { jev: 0.042e-6, openai: 0.10e-6 };

/** 7.2 after A5: output tokens, Jev $0, OpenAI Decisions $0.50 / M. */
export const PRICE_PER_OUTPUT_TOKEN: Readonly<Record<ProviderId, number>> = { jev: 0, openai: 0.5e-6 };

/** 7.3: priced at 3x the 7.2 planning per-call values. */
export const GUARD_USD_PER_CALL: Readonly<Record<ProviderId, number>> = { jev: 0.0002, openai: 0.0003 };

/** 7.2 planning per-call values (the measured-spend guard compares against these). */
export const PLAN_USD_PER_CALL: Readonly<Record<ProviderId, number>> = { jev: 0.0000646, openai: 0.000113 };

export const ALL_PHASES_PRICED_STOP_USD = 60;
export const OPENROUTER_STOP_USD = 10;

function tokens(usage: unknown, names: readonly string[]): number | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const u = usage as Record<string, unknown>;
  for (const name of names) if (typeof u[name] === 'number') return u[name];
  return null;
}

/**
 * A row's own usage priced with the 7.2 table after A5 (input plus output, summed over every HTTP request); null
 * when no usage names input tokens.
 */
export function priceUsage(provider: ProviderId, usages: readonly unknown[]): number | null {
  let usd = 0;
  let seen = false;
  for (const usage of usages) {
    const n = tokens(usage, ['prompt_tokens', 'input_tokens']);
    if (n === null) continue;
    seen = true;
    usd += n * PRICE_PER_INPUT_TOKEN[provider] + (tokens(usage, ['completion_tokens', 'output_tokens']) ?? 0) * PRICE_PER_OUTPUT_TOKEN[provider];
  }
  return seen ? usd : null;
}

/** Appends one guard line to `<results>/<phase>/guards.jsonl`. */
export function guardLine(results: string, phase: string, guard: string, value: unknown, action: string): void {
  mkdirSync(join(results, phase), { recursive: true });
  appendFileSync(join(results, phase, 'guards.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), guard, value, action })}\n`);
}

/** The stop every runner obeys: `<results>/STOP` with its reason; `null` when absent. */
export function stopReason(results: string): string | null {
  const path = join(results, 'STOP');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() || 'stopped' : null;
}

export function stopAll(results: string, phase: string, guard: string, value: unknown): void {
  writeFileSync(join(results, 'STOP'), `${guard}: ${JSON.stringify(value)}\n`);
  guardLine(results, phase, guard, value, 'stop all runners');
}

/**
 * The bench key's own spend from the gateway's key-info path (read-only, its own row), or null when unreadable.
 * The key is read from env here and never printed or stored.
 */
export async function readKeySpend(gatewayUrl: string, path: string, keyEnv: string): Promise<number | null> {
  const key = process.env[keyEnv]?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`, {
      headers: { authorization: `Bearer ${key}` }, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { info?: { spend?: unknown }; spend?: unknown };
    const spend = json.info?.spend ?? json.spend;
    return typeof spend === 'number' ? spend : null;
  } catch {
    return null;
  }
}

interface BucketState { sends: number[]; factor: number; pausedUntil: number }

/**
 * One rate bucket shared by every runner on the same results dir (7.1: one 480 rpm bucket for the gateway arms):
 * a sliding 60 s window of send times in `<results>/.rate/<name>.json`, guarded by a mkdir lock. `factor` (halved
 * by the 429 rule) and `pausedUntil` (the 429 and latency pauses) live in the same file, so they bind every runner.
 */
export class RateBucket {
  private readonly dir: string;
  private readonly file: string;
  private readonly lock: string;

  constructor(results: string, name: string, private readonly rpm: number) {
    this.dir = join(results, '.rate');
    this.file = join(this.dir, `${name}.json`);
    this.lock = join(this.dir, `${name}.lock`);
    mkdirSync(this.dir, { recursive: true });
  }

  private async locked<T>(work: (state: BucketState) => T): Promise<T> {
    for (;;) {
      try {
        mkdirSync(this.lock);
        break;
      } catch {
        try {
          if (Date.now() - statSync(this.lock).mtimeMs > 10_000) rmSync(this.lock, { recursive: true, force: true });
        } catch { /* raced with its owner */ }
        await sleep(5 + Math.random() * 20);
      }
    }
    try {
      const state: BucketState = existsSync(this.file)
        ? (JSON.parse(readFileSync(this.file, 'utf8')) as BucketState)
        : { sends: [], factor: 1, pausedUntil: 0 };
      const result = work(state);
      writeFileSync(this.file, JSON.stringify(state));
      return result;
    } finally {
      rmSync(this.lock, { recursive: true, force: true });
    }
  }

  /** Waits for a send slot (and out any pause), then takes it. */
  async take(): Promise<void> {
    for (;;) {
      const wait = await this.locked((state) => {
        const now = Date.now();
        state.sends = state.sends.filter((t) => t > now - 60_000);
        if (state.pausedUntil > now) return state.pausedUntil - now;
        const cap = Math.max(1, Math.floor(this.rpm * state.factor));
        if (state.sends.length < cap) {
          state.sends.push(now);
          return 0;
        }
        return (state.sends[0] ?? now) + 60_000 - now;
      });
      if (wait <= 0) return;
      await sleep(Math.min(wait, 1000));
    }
  }

  async halve(): Promise<number> {
    return this.locked((state) => {
      state.factor = Math.max(1 / 64, state.factor / 2);
      return state.factor;
    });
  }

  async pause(ms: number): Promise<void> {
    await this.locked((state) => {
      state.pausedUntil = Math.max(state.pausedUntil, Date.now() + ms);
    });
  }
}

/** What one runner's guards need; `planned*` come from the P3 manifest, absent = that guard is not armed. */
export interface GuardOptions {
  results: string;
  phase: string;
  arm: string;
  provider: ProviderId;
  via: 'gateway' | 'direct';
  bucket: RateBucket | null;
  /** 7.3 counts: planned rows for this (phase, arm, set); refuse beyond 1.15x. */
  plannedRows?: number;
  /** The phase's own 3x-priced plan in USD (P4a apart from P4); stop at 1.5x of it. */
  phasePricedPlanUsd?: number;
  /** Priced sum of this phase's gateway ledgers (same phase dir and slice) before this run started. */
  phasePricedBeforeUsd?: number;
  /** The phase's priced plan at 7.2 planning values; measured key spend above 2x stops all runners. */
  phasePlanUsd?: number;
  /** Priced sum of every gateway ledger before this runner started (all phases). */
  pricedBeforeUsd?: number;
  /** This run's priced sum, shared by every runner of the process (so the phase sum counts every arm it runs). */
  runPriced?: { usd: number };
  /** OpenRouter `usage.cost` already spent on this arm's rows. */
  openrouterBeforeUsd?: number;
  keySpend?: () => Promise<number | null>;
}

const WINDOW_MS = 5 * 60_000;
const BASELINE_MS = 30 * 60_000;
const PAUSE_MS = 10 * 60_000;

/** The live 7.3 rules for one runner. Call `admit()` before a row, `attemptGate` before each attempt, `observe` after. */
export class RunnerGuards {
  private rows = 0;
  private priced = 0;
  private openrouter = 0;
  private gatewayCalls = 0;
  private readonly started = Date.now();
  private keyAtStart: number | null | undefined;
  private nextKeyRead = 1000;
  private recent: { t: number; is429: boolean; wire: number }[] = [];
  private baseline: number[] = [];
  private lastHalve = 0;
  private slowUntil = 0;

  constructor(private readonly o: GuardOptions) {}

  private log(guard: string, value: unknown, action: string): void {
    guardLine(this.o.results, this.o.phase, guard, value, action);
  }

  /** A reason to stop before the next row, or null. */
  admit(): string | null {
    const stop = stopReason(this.o.results);
    if (stop) return `STOP file: ${stop}`;
    if (this.o.plannedRows !== undefined && this.rows >= Math.floor(this.o.plannedRows * 1.15)) {
      this.log('count', { rows: this.rows, planned: this.o.plannedRows }, `stop ${this.o.arm}`);
      return 'count guard: 1.15x the planned rows';
    }
    return null;
  }

  /** Before each outer attempt: one bucket token (waits out shared pauses). */
  async attemptGate(): Promise<void> {
    await this.o.bucket?.take();
  }

  /**
   * Flags a row carries when it is sent now (`slow_window` inside a detected window). Read it after the bucket gate.
   * The guard line's [from, to] span is the full record; the analysis flags from it, this is only the live mark.
   */
  flags(): string[] {
    return Date.now() < this.slowUntil ? ['slow_window'] : [];
  }

  /** After a row: updates sums and windows, applies the 7.3 rules; returns a stop reason for this runner, or null. */
  async observe(row: { status: string; usd: number | null; attempts: { status: string; t_wire: number[]; spent: boolean; http_status: number[] }[] }): Promise<string | null> {
    this.rows += 1;
    const now = Date.now();
    const calls = row.attempts.length;
    if (this.o.via === 'gateway') {
      const usd = calls * GUARD_USD_PER_CALL[this.o.provider];
      this.priced += usd;
      if (this.o.runPriced) this.o.runPriced.usd += usd;
      this.gatewayCalls += calls;
    } else if (row.usd !== null) {
      this.openrouter += row.usd;
    }
    for (const attempt of row.attempts) {
      const codes = attempt.http_status;
      // 402 is a key refusal too (refsure's KEY_REFUSED; OpenRouter answers it when credits run out).
      if (codes.some((code) => code === 401 || code === 402 || code === 403)) {
        stopAll(this.o.results, this.o.phase, 'auth', { arm: this.o.arm, status: attempt.status });
        return 'a 401/402/403: every runner stops';
      }
      if (attempt.spent) {
        stopAll(this.o.results, this.o.phase, 'quota_spent', { arm: this.o.arm });
        return 'a 429 says the quota or budget is spent';
      }
      attempt.t_wire.forEach((wire, i) => {
        this.recent.push({ t: now, is429: codes[i] === 429, wire });
        if (now - this.started < BASELINE_MS) this.baseline.push(wire);
      });
    }
    this.recent = this.recent.filter((entry) => entry.t > now - WINDOW_MS);
    await this.rules(now);
    return this.spendStops();
  }

  private async rules(now: number): Promise<void> {
    const n = this.recent.length;
    if (n >= 50 && this.o.bucket) {
      const share = this.recent.filter((entry) => entry.is429).length / n;
      if (share > 0.10) {
        await this.o.bucket.pause(PAUSE_MS);
        this.log('rate_429', share, 'pause 10 min');
        this.recent = [];
      } else if (share > 0.02 && now - this.lastHalve > WINDOW_MS) {
        const factor = await this.o.bucket.halve();
        this.lastHalve = now;
        this.log('rate_429', share, `halve the bucket (factor ${factor})`);
      }
    }
    if (now - this.started >= BASELINE_MS && this.baseline.length >= 30 && n >= 30) {
      const base = median(this.baseline);
      const current = median(this.recent.map((entry) => entry.wire));
      if (current > 3 * base && now >= this.slowUntil) {
        this.slowUntil = now + PAUSE_MS;
        // The slow window began before detection: the analysis flags `slow_window` on every row of this phase
        // whose `ts_start` lies in [from, to] (the 5 min window that tripped the rule, then the pause).
        const span = { from: new Date(now - WINDOW_MS).toISOString(), to: new Date(now + PAUSE_MS).toISOString() };
        this.log('latency', { p50: current, baseline: base, arm: this.o.arm, ...span }, 'pause 10 min; rows with ts_start in [from, to] are slow_window');
        await this.o.bucket?.pause(PAUSE_MS);
        if (!this.o.bucket) await sleep(PAUSE_MS);
      }
    }
  }

  private async spendStops(): Promise<string | null> {
    const run = this.o.runPriced?.usd ?? this.priced;
    const phaseSum = (this.o.phasePricedBeforeUsd ?? 0) + run;
    if (this.o.phasePricedPlanUsd !== undefined && phaseSum > 1.5 * this.o.phasePricedPlanUsd) {
      this.log('priced_phase', { sum: phaseSum, plan: this.o.phasePricedPlanUsd }, `stop ${this.o.arm} (exit 3)`);
      return 'priced phase guard';
    }
    if ((this.o.pricedBeforeUsd ?? 0) + run >= ALL_PHASES_PRICED_STOP_USD) {
      stopAll(this.o.results, this.o.phase, 'priced_all', (this.o.pricedBeforeUsd ?? 0) + run);
      return 'priced all-phases guard';
    }
    if (this.o.via === 'direct' && (this.o.openrouterBeforeUsd ?? 0) + this.openrouter >= OPENROUTER_STOP_USD) {
      this.log('openrouter', (this.o.openrouterBeforeUsd ?? 0) + this.openrouter, `stop ${this.o.arm}`);
      return 'OpenRouter spend guard';
    }
    if (this.o.keySpend && this.o.phasePlanUsd !== undefined && this.gatewayCalls > 0) {
      if (this.keyAtStart === undefined) this.keyAtStart = await this.o.keySpend();
      if (this.gatewayCalls >= this.nextKeyRead && this.keyAtStart !== null) {
        this.nextKeyRead += 1000;
        const spend = await this.o.keySpend();
        if (spend !== null && spend - this.keyAtStart > 2 * this.o.phasePlanUsd) {
          stopAll(this.o.results, this.o.phase, 'key_spend', { since: spend - this.keyAtStart, plan: this.o.phasePlanUsd });
          return 'measured key spend guard';
        }
      }
    }
    return null;
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
}
