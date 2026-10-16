import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestByKey, ledgerFiles, readRows } from '../lib/ledger';
import { nearestRank } from '../lib/stats';
import type { Grade } from './scenario';

/*
  The 6.4 readings of P7, per `<cfg>.<backend>`: pass/safe/fail counts per scenario (k of the repeats), total wrong
  clicks, repeated writes and false claims, and p50/p95 `T_cli` per verb (nearest rank, ok and non-ok rows alike).
  Reads `<results>/e2e/cli/runs*.jsonl`, latest row per row key: run rows that are `scored`, and the command rows of
  exactly those runs (a voided attempt's commands were re-run under the scored run and are not counted twice).
  Writes `<results>/e2e/summary.json`, which analyze/render.ts copies into the Q15 table.
*/

interface RunRow {
  kind: 'run'; row_key: string; run_id: string; scenario: string; cfg: string; backend: string; status: string;
  outcome: Grade | null; false_claim: boolean | null; flags?: string[];
  measures?: { wrong_clicks?: number; repeated_writes?: number };
}
interface CommandRow { kind: 'command'; row_key: string; run_id: string; cfg: string; backend: string; argv: string[] | null; t_cli: number | null }
interface InjectionRow { kind: 'injection'; cfg: string; exit: number | null; t_ms: number }

type Counts = Record<Grade, number>;
interface Cell {
  runs: number; flagged_runs: number; outcomes: Counts; scenarios: Record<string, Counts & { of: number }>;
  wrong_clicks: number; repeated_writes: number; false_claims: number; t_cli_ms: Record<string, { n: number; p50: number; p95: number }>;
}

const zero = (): Counts => ({ pass: 0, safe: 0, fail: 0 });
const quantiles = (xs: readonly number[]) => ({ n: xs.length, p50: nearestRank(xs, 0.5), p95: nearestRank(xs, 0.95) });

export function summarize(results: string): { path: string; summary: { phase: string; readings: Record<string, unknown> } } {
  const latest = latestByKey<RunRow | CommandRow>(ledgerFiles(results, 'e2e', 'cli', 'runs'));
  const cells: Record<string, Record<string, Cell>> = {};
  const cellOf = (cfg: string, backend: string): Cell => {
    const byBackend = (cells[cfg] ??= {});
    byBackend[backend] ??= { runs: 0, flagged_runs: 0, outcomes: zero(), scenarios: {}, wrong_clicks: 0, repeated_writes: 0, false_claims: 0, t_cli_ms: {} };
    return byBackend[backend]!;
  };
  const scoredRuns = new Set<string>();
  for (const row of latest.values()) {
    if (row.kind !== 'run' || row.status !== 'scored' || row.outcome === null) continue;
    scoredRuns.add(row.run_id);
    const cell = cellOf(row.cfg, row.backend);
    cell.runs += 1;
    if ((row.flags ?? []).length > 0) cell.flagged_runs += 1;
    cell.outcomes[row.outcome] += 1;
    const sc = (cell.scenarios[row.scenario] ??= { ...zero(), of: 0 });
    sc[row.outcome] += 1;
    sc.of += 1;
    cell.wrong_clicks += row.measures?.wrong_clicks ?? 0;
    cell.repeated_writes += row.measures?.repeated_writes ?? 0;
    if (row.false_claim === true) cell.false_claims += 1;
  }
  const times = new Map<string, number[]>();
  for (const row of latest.values()) {
    if (row.kind !== 'command' || row.t_cli === null || row.argv === null || !scoredRuns.has(row.run_id)) continue;
    const key = JSON.stringify([row.cfg, row.backend, row.argv[0] ?? '?']);
    times.set(key, [...(times.get(key) ?? []), row.t_cli]);
  }
  for (const [key, xs] of times) {
    const [cfg, backend, verb] = JSON.parse(key) as [string, string, string];
    cellOf(cfg, backend).t_cli_ms[verb] = quantiles(xs);
  }
  const injection: Record<string, { n: number; p50: number; p95: number }> = {};
  const injPath = join(results, 'e2e', 'injection.jsonl');
  if (existsSync(injPath)) {
    const byCfg = new Map<string, number[]>();
    for (const r of readRows<InjectionRow>(injPath)) if (r.kind === 'injection' && r.exit === 0) byCfg.set(r.cfg, [...(byCfg.get(r.cfg) ?? []), r.t_ms]);
    for (const [cfg, xs] of byCfg) injection[cfg] = quantiles(xs);
  }
  const summary = { phase: 'P7', readings: cells, key_injection_ms: injection };
  const path = join(results, 'e2e', 'summary.json');
  mkdirSync(join(results, 'e2e'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`);
  return { path, summary };
}
