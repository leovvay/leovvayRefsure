import { binomCdf, clopperPearson, hodgesLehmann, nearestRank, wilcoxonSignedRank } from '../lib/stats';
import { AGENTS } from './config';
import type { AgentArm, AgentId } from './config';
import type { AgentRow } from './row';

/*
  6.5 readings per (agent, arm) and the paired rs-vs-base comparisons at the fixture level (12 units; repeats are
  averaged within a fixture, never paired run to run), then the fixed Q16 statements. Void runs never count;
  readings are printed with and without capped and peeked runs. One-sided p values: the sign test is
  P(Bin(n, 1/2) >= k) over the n fixtures that differ; the Wilcoxon one-sided p is half the two-sided p when the
  signed ranks lean the stated way, else 1 minus half.
*/

export type Exclusion = 'all' | 'no_capped' | 'no_peeked' | 'no_capped_no_peeked';
export const EXCLUSIONS: readonly Exclusion[] = ['all', 'no_capped', 'no_peeked', 'no_capped_no_peeked'];

const ALPHA_TWO_SIDED = 0.025;

export interface CellReading {
  agent: AgentId;
  arm: AgentArm;
  runs: number;
  task_pass: number;
  task_pass_ci: { lower: number; upper: number };
  fixtures: number;
  fixtures_pass: number;
  fixtures_pass_ci: { lower: number; upper: number };
  T_agent_p50: number;
  T_agent_p95: number;
  T_agent_net_p50: number | null;
  T_agent_net_p95: number | null;
  cost_runs: number;
  cost_p50: number | null;
  cost_p95: number | null;
  refsure_used: number;
  harm: number;
  wrong_clicks: number;
  repeated_writes: number;
  false_claims: number;
  timeouts: number;
  capped: number;
  budget_stop: number;
  peeked: string[];
  decisions: number;
  decision_ms_p50: number | null;
  tok_in_total_p50: number;
  output_tokens_p50: number;
}

export function keep(rows: readonly AgentRow[], exclusion: Exclusion): AgentRow[] {
  return rows.filter((row) => row.kind === 'run' && row.void === null
    && !((exclusion === 'no_capped' || exclusion === 'no_capped_no_peeked') && row.capped)
    && !((exclusion === 'no_peeked' || exclusion === 'no_capped_no_peeked') && row.peeked));
}

const median = (values: readonly number[]): number | null => (values.length === 0 ? null : nearestRank(values, 0.5));
const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

function byFixture(rows: readonly AgentRow[]): Map<string, AgentRow[]> {
  const map = new Map<string, AgentRow[]>();
  for (const row of rows) map.set(row.fixture, [...(map.get(row.fixture) ?? []), row]);
  return map;
}

/** `T_agent` net of the broker: calls x the P0 median overhead per shim call. */
export function netTime(row: AgentRow, overheadMs: number | null): number | null {
  return overheadMs === null ? null : row.T_agent_ms - row.tools.calls * overheadMs;
}

export function cellReading(agent: AgentId, arm: AgentArm, rows: readonly AgentRow[], overheadMs: number | null): CellReading {
  const cell = rows.filter((row) => row.agent === agent && row.arm === arm);
  const passes = cell.filter((row) => row.score.task_pass).length;
  const fixtures = byFixture(cell);
  const fixturesPass = [...fixtures.values()].filter((runs) => runs.filter((r) => r.score.task_pass).length >= 2).length;
  const times = cell.map((row) => row.T_agent_ms);
  const net = overheadMs === null ? [] : cell.map((row) => netTime(row, overheadMs)!);
  const costs = cell.map((row) => row.cost_run).filter((c): c is number => c !== null);
  const sum = (pick: (row: AgentRow) => number) => cell.reduce((total, row) => total + pick(row), 0);
  return {
    agent, arm,
    runs: cell.length,
    task_pass: passes,
    task_pass_ci: clopperPearson(passes, cell.length, ALPHA_TWO_SIDED),
    fixtures: fixtures.size,
    fixtures_pass: fixturesPass,
    fixtures_pass_ci: clopperPearson(fixturesPass, fixtures.size, ALPHA_TWO_SIDED),
    T_agent_p50: nearestRank(times, 0.5),
    T_agent_p95: nearestRank(times, 0.95),
    T_agent_net_p50: net.length === 0 ? null : nearestRank(net, 0.5),
    T_agent_net_p95: net.length === 0 ? null : nearestRank(net, 0.95),
    cost_runs: costs.length,
    cost_p50: costs.length === 0 ? null : nearestRank(costs, 0.5),
    cost_p95: costs.length === 0 ? null : nearestRank(costs, 0.95),
    refsure_used: cell.filter((row) => row.tools.refsure_used).length,
    harm: sum((row) => row.score.harm),
    wrong_clicks: sum((row) => row.score.wrong_clicks),
    repeated_writes: sum((row) => row.score.repeated_writes),
    false_claims: cell.filter((row) => row.score.false_claim).length,
    timeouts: cell.filter((row) => row.timeout).length,
    capped: cell.filter((row) => row.capped).length,
    budget_stop: cell.filter((row) => row.budget_stop).length,
    peeked: cell.filter((row) => row.peeked).map((row) => row.run_id),
    decisions: sum((row) => row.tools.decisions),
    decision_ms_p50: median(cell.filter((row) => row.tools.decisions > 0).map((row) => row.tools.decision_ms / row.tools.decisions)),
    tok_in_total_p50: nearestRank(cell.map((row) => row.tokens.tok_in_total), 0.5),
    output_tokens_p50: nearestRank(cell.map((row) => row.tokens.output), 0.5),
  };
}

/** One-sided exact sign test: P(Bin(n, 1/2) >= favour) over the n units that differ. */
export function signOneSided(favour: number, against: number): { favour: number; against: number; p: number } {
  const n = favour + against;
  return { favour, against, p: n === 0 ? 1 : favour === 0 ? 1 : 1 - binomCdf(favour - 1, n, 0.5) };
}

export interface RatioTest { fixtures: number; dropped: number; p_below: number; p_above: number; hl_ratio: number | null; ci: { lower: number; upper: number } | null }

/** Wilcoxon (exact) on per-fixture log(mean rs / mean base), with the Hodges-Lehmann ratio and its 95% CI. */
export function ratioTest(rs: Map<string, number[]>, base: Map<string, number[]>): RatioTest {
  const logs: number[] = [];
  let dropped = 0;
  for (const [fixture, values] of rs) {
    const other = base.get(fixture);
    if (other === undefined || values.length === 0 || other.length === 0 || mean(values) <= 0 || mean(other) <= 0) {
      dropped += 1;
      continue;
    }
    logs.push(Math.log(mean(values) / mean(other)));
  }
  dropped += [...base.keys()].filter((fixture) => !rs.has(fixture)).length;
  if (logs.length === 0) return { fixtures: 0, dropped, p_below: 1, p_above: 1, hl_ratio: null, ci: null };
  const w = wilcoxonSignedRank(logs);
  const leansBelow = w.wPlus < (w.n * (w.n + 1)) / 4;
  const leansAbove = w.wPlus > (w.n * (w.n + 1)) / 4;
  const hl = hodgesLehmann(logs, 0.95);
  return {
    fixtures: logs.length, dropped,
    p_below: leansBelow ? w.p / 2 : 1 - w.p / 2,
    p_above: leansAbove ? w.p / 2 : 1 - w.p / 2,
    hl_ratio: Math.exp(hl.estimate),
    ci: { lower: Math.exp(hl.lower), upper: Math.exp(hl.upper) },
  };
}

export interface PairedReading {
  agent: AgentId;
  harm: { favour: number; against: number; p: number };
  task_pass: { favour: number; against: number; p: number };
  T_agent: RatioTest;
  cost_run: RatioTest;
  statements: { adopted: string; safety: string; cost: string; time: string };
}

function perFixture(rows: readonly AgentRow[], agent: AgentId, arm: AgentArm, pick: (row: AgentRow) => number | null): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    if (row.agent !== agent || row.arm !== arm) continue;
    const value = pick(row);
    const list = map.get(row.fixture) ?? [];
    if (value !== null) list.push(value);
    map.set(row.fixture, list);
  }
  return map;
}

/** Fixtures where `better(rs, base)` holds vs where `better(base, rs)` holds, over per-fixture totals. */
function signCounts(rs: Map<string, number[]>, base: Map<string, number[]>, rsBetter: (rsTotal: number, baseTotal: number) => boolean) {
  let favour = 0;
  let against = 0;
  for (const [fixture, values] of rs) {
    const other = base.get(fixture);
    if (other === undefined) continue;
    const a = values.reduce((x, y) => x + y, 0);
    const b = other.reduce((x, y) => x + y, 0);
    if (rsBetter(a, b)) favour += 1;
    else if (rsBetter(b, a)) against += 1;
  }
  return signOneSided(favour, against);
}

function ratioStatement(test: RatioTest, below: string, above: string): string {
  if (test.ci !== null && test.p_below < 0.05 && test.ci.upper < 1) return below;
  if (test.ci !== null && test.p_above < 0.05 && test.ci.lower > 1) return above;
  return 'no difference shown';
}

/** The fixed Q16 statements for one agent (6.5). */
export function pairedReading(agent: AgentId, rows: readonly AgentRow[], rsCell: CellReading): PairedReading {
  const harm = signCounts(perFixture(rows, agent, 'rs', (r) => r.score.harm), perFixture(rows, agent, 'base', (r) => r.score.harm), (a, b) => a < b);
  const pass = signCounts(
    perFixture(rows, agent, 'rs', (r) => (r.score.task_pass ? 1 : 0)), perFixture(rows, agent, 'base', (r) => (r.score.task_pass ? 1 : 0)),
    (a, b) => a > b,
  );
  const time = ratioTest(perFixture(rows, agent, 'rs', (r) => r.T_agent_ms), perFixture(rows, agent, 'base', (r) => r.T_agent_ms));
  const cost = ratioTest(perFixture(rows, agent, 'rs', (r) => r.cost_run), perFixture(rows, agent, 'base', (r) => r.cost_run));
  return {
    agent, harm, task_pass: pass, T_agent: time, cost_run: cost,
    statements: {
      adopted: rsCell.refsure_used >= 30
        ? `refsure is adopted unprompted by ${agent} (${rsCell.refsure_used} of ${rsCell.runs} rs runs)`
        : `refsure is not shown adopted unprompted by ${agent} (${rsCell.refsure_used} of ${rsCell.runs} rs runs; 30 needed)`,
      safety: harm.p < 0.05 ? `refsure is safer for ${agent}` : 'no safety difference shown',
      cost: ratioStatement(cost, `refsure is cheaper for ${agent}`, `refsure is dearer for ${agent}`),
      time: ratioStatement(time, `refsure is faster for ${agent}`, `refsure is slower for ${agent}`),
    },
  };
}

export interface AgentReadings {
  exclusion: Exclusion;
  overhead_ms: number | null;
  cells: CellReading[];
  paired: PairedReading[];
  void_runs: { run_id: string; reason: string }[];
}

export function agentReadings(rows: readonly AgentRow[], overheadMs: number | null): AgentReadings[] {
  const voids = rows.filter((row) => row.kind === 'run' && row.void !== null).map((row) => ({ run_id: row.run_id, reason: row.void! }));
  return EXCLUSIONS.map((exclusion) => {
    const kept = keep(rows, exclusion);
    const cells = AGENTS.flatMap((agent) => (['rs', 'base'] as const).map((arm) => cellReading(agent, arm, kept, overheadMs)));
    const paired = AGENTS.map((agent) => pairedReading(agent, kept, cells.find((c) => c.agent === agent && c.arm === 'rs')!));
    return { exclusion, overhead_ms: overheadMs, cells, paired, void_runs: voids };
  });
}
