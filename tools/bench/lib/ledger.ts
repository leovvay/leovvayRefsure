import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Threshold } from '../../../src/questions';

/*
  7.4 ledgers: append-only JSONL, one row per call, one writer per file. `<results>/<phase>/<arm>/<set>.jsonl`; a
  resume run writes `<set>.resume<N>.jsonl` beside it. Readers take `.jsonl` and `.jsonl.gz` and keep the latest
  row per `row_key` in file order (base, then resume1, resume2, ...).
*/

/** One outer attempt (2.1): what the provider returned plus what the bench fetch wrapper saw on the wire. */
export interface AttemptRecord {
  status: string;
  /** refsure's own `ProviderAnswer.ms` (transport, its in-deadline retry included). */
  provider_ms: number;
  /** One `T_wire` per HTTP request inside this attempt (4.2), in ms. */
  t_wire: number[];
  /** From the `provider.ask` call to the return of the R1 read (4.2). */
  t_ask: number;
  http_status: number[];
  /** The raw `usage` object of each 2xx response, cached-token fields included; null when none. */
  usage: unknown[];
  /** The arms file's `recordHeaders`, per HTTP request. */
  headers: Record<string, string>[];
  timed_out: boolean;
  /** A 429 whose body said the quota or budget is spent. */
  spent: boolean;
  resp_bytes: number[];
}

export interface R1Read {
  verdict: 'answer' | 'abstain';
  value: unknown;
  /** The presented key the model chose (candidate sites), or null. */
  index: string | null;
  cause: string | null;
  confidence: number | null;
  threshold: number | null;
}

/** One quality row (7.4). Fields a phase does not fill are null. */
export interface QualityRow {
  row_key: string; run_id: string; phase: string; slice: 'interim' | 'final';
  ts_start: string | null; ts_end: string | null;
  set: string; set_sha: string; item: string; base: string; group: string; origin: 'stored' | 'native';
  site: string; arm: string; provider: string; route: 'shipped' | 'research'; rendering: string; variant: string;
  order: string; salt: string | null; repeat: string; presented: Record<string, number | null> | null;
  gold: string; alt: string[]; gold_cut: boolean; gold_twin: boolean; risk: string | null; lang: string;
  condition: string; masks: boolean; visual_only: boolean;
  status: string; cause: string | null; http_status: number | null; detail: string | null;
  model: string | null; family_ok: boolean | null; model_changed: boolean | null;
  digest: string | null; qdigest: string | null; wording_hash: string; req_bytes: number | null; resp_bytes: number | null;
  answer: unknown; strict_valid: boolean | null;
  threshold_r1: Threshold | null; threshold_source: 'refsure' | 'research' | null; r1: R1Read | null;
  settle: unknown;
  correct: boolean | null; dangerous: boolean | null; danger_eligible: boolean;
  usd: number | null; usd_priced: number | null;
  attempts: AttemptRecord[];
  ms_total: number; deadline_ms: number; flags: string[];
  concurrency: number; loadavg: number; host: string;
  arms_sha: string; refsure_commit: string; bench_commit: string; node: string;
  /** 2.5 drift and 2.6 re-ask rows: the prior run's stored answer for the same item and repeat or order. */
  prior?: unknown;
}

/** 7.4: sha256 of `phase \0 set \0 item \0 site \0 arm \0 variant \0 order \0 repeat`. */
export function rowKey(k: { phase: string; set: string; item: string; site: string; arm: string; variant: string; order: string; repeat: string }): string {
  return createHash('sha256').update([k.phase, k.set, k.item, k.site, k.arm, k.variant, k.order, k.repeat].join('\0')).digest('hex');
}

const FAILURE = /^(timeout|transport|http_\d+)$/;

const RETRYABLE = /^(timeout|transport|http_429|http_5\d\d)$/;

/**
 * Terminal (2.3, 7.4): `ok`, `refusal`, `invalid`, `refused:<cause>`, a non-retryable HTTP failure (one attempt by
 * design), or a retryable failure after all outer attempts.
 */
export function isTerminal(row: Pick<QualityRow, 'status' | 'attempts'>, maxAttempts = 3): boolean {
  if (!FAILURE.test(row.status)) return true;
  return row.attempts.length >= maxAttempts || !RETRYABLE.test(row.status);
}

/** A failure row an explicit `--resume` run asks again (timeout, transport, any HTTP failure). */
export function isFailure(row: Pick<QualityRow, 'status'>): boolean {
  return FAILURE.test(row.status);
}

/** `<results>/<phase>/<arm>/<set>.jsonl`, or `<set>.resume<N>.jsonl` for the N-th resume run. */
export function ledgerPath(results: string, phase: string, arm: string, set: string, resume = 0): string {
  return join(results, phase, arm, resume > 0 ? `${set}.resume${resume}.jsonl` : `${set}.jsonl`);
}

/** The ledger files of one (phase, arm, set) in reading order: base, then resume1, resume2, ... (`.gz` included). */
export function ledgerFiles(results: string, phase: string, arm: string, set: string): string[] {
  const dir = join(results, phase, arm);
  if (!existsSync(dir)) return [];
  const resumeOf = (name: string) => Number(/\.resume(\d+)\.jsonl(\.gz)?$/.exec(name)?.[1] ?? 0);
  const ours = readdirSync(dir).filter((name) => name === `${set}.jsonl` || name === `${set}.jsonl.gz`
    || new RegExp(`^${set.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.resume\\d+\\.jsonl(\\.gz)?$`).test(name));
  return ours.sort((a, b) => resumeOf(a) - resumeOf(b)).map((name) => join(dir, name));
}

/** Every parsable row of a `.jsonl` or `.jsonl.gz` file; an unreadable line (a killed run's last write) is skipped. */
export function readRows<T = QualityRow>(path: string): T[] {
  const raw = readFileSync(path);
  const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const out: T[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      process.stderr.write(`${path}: skipped an unreadable line\n`);
    }
  }
  return out;
}

/** The latest row per `row_key` over `files` in the order given. */
export function latestByKey<T extends { row_key: string }>(files: readonly string[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const file of files) for (const row of readRows<T>(file)) latest.set(row.row_key, row);
  return latest;
}

/** What a run over one (phase, arm, set) skips: every key whose latest row is terminal; with `resume`, only non-failures. */
export function doneKeys(files: readonly string[], opts: { resume: boolean; maxAttempts?: number }): Set<string> {
  const done = new Set<string>();
  for (const [key, row] of latestByKey<QualityRow>(files)) {
    if (opts.resume ? !isFailure(row) : isTerminal(row, opts.maxAttempts)) done.add(key);
  }
  return done;
}

/** The next free resume number for this (phase, arm, set). */
export function nextResume(results: string, phase: string, arm: string, set: string): number {
  const used = ledgerFiles(results, phase, arm, set).map((file) => Number(/\.resume(\d+)\./.exec(file)?.[1] ?? 0));
  return Math.max(0, ...used) + 1;
}

/**
 * The single writer of one ledger file: a `<file>.lock` holding the pid is taken exclusively (a second writer
 * throws), every row is appended synchronously, and `close()` drops the lock.
 */
export interface LedgerWriter { path: string; append(row: unknown): void; close(): void }

/** Whether the pid in a lock file names no live process (`kill(pid, 0)` fails with ESRCH). */
function lockHolderGone(holder: string): boolean {
  const pid = Number(holder);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export function openLedger(path: string): LedgerWriter {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch {
    const holder = existsSync(lock) ? readFileSync(lock, 'utf8').trim() : '?';
    if (!lockHolderGone(holder)) {
      throw new Error(`${path} already has a writer (pid ${holder}); remove ${lock} only if that process is gone`);
    }
    // A killed run (Ctrl-C, SIGTERM, SIGKILL) leaves its lock: take it over. A racing taker loses the `wx` below.
    process.stderr.write(`${path}: taking over the lock of pid ${holder}, which is gone\n`);
    rmSync(lock, { force: true });
    fd = openSync(lock, 'wx');
  }
  writeSync(fd, `${process.pid}\n`);
  closeSync(fd);
  let open = true;
  const release = () => {
    if (open) rmSync(lock, { force: true });
    open = false;
  };
  process.once('exit', release);
  return {
    path,
    append(row) {
      if (!open) throw new Error(`${path}: the writer is closed`);
      appendFileSync(path, `${JSON.stringify(row)}\n`);
    },
    close: release,
  };
}
