import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, need, opt } from '../../calibrate/lib/args';
import { assertFrozen, readFreezeTable } from '../lib/freeze';
import { readRows } from '../lib/ledger';
import { readAgentsConfig } from './config';
import { readFixtures } from './fixtures';
import { agentReadings } from './readings';
import { assembleContext, assembleRow } from './row';
import type { AgentRow } from './row';
import { helpExit } from '../lib/help';

/*
  P8 scoring (6.5), code only: rebuilds every agent row from its run directory and the click log (the latest row
  per `row_key`; scoring rules live in scoring.ts and row.ts), then the readings per (agent, arm), the paired
  rs-vs-base tests at the fixture level and the fixed Q16 statements, each with and without capped and peeked runs.

    score --rows <results>/P8/agents.jsonl --set <n12.jsonl> --freeze <table> --out <dir> [--overhead <overhead.json>]

  Writes `<dir>/agents.scored.jsonl` and `<dir>/agent-readings.json`; prints one line per (agent, arm).
*/

const USAGE = 'usage: score --rows <agents.jsonl> --set <n12.jsonl> --freeze <table> --out <dir> [--overhead <overhead.json>]';
helpExit(USAGE);
const values = flags(process.argv.slice(2), ['rows', 'set', 'freeze', 'out', 'overhead'], USAGE);
const rowsPath = need(values, 'rows', USAGE);
const setPath = need(values, 'set', USAGE);
const outDir = need(values, 'out', USAGE);
assertFrozen(readFreezeTable(need(values, 'freeze', USAGE)), setPath);
const overheadPath = opt(values, 'overhead');
if (overheadPath !== undefined && !existsSync(overheadPath)) {
  process.stderr.write(`--overhead ${overheadPath}: no such file (run-agents overhead writes it)\n${USAGE}\n`);
  process.exit(64);
}
const overheadMs = overheadPath !== undefined
  ? (JSON.parse(readFileSync(overheadPath, 'utf8')) as { median_overhead_ms: number }).median_overhead_ms
  : null;

const loaded = readAgentsConfig();
const ctx = assembleContext(loaded.config);
const fixtures = new Map(readFixtures(setPath).map((fixture) => [fixture.id, fixture]));
const latest = new Map<string, AgentRow>();
for (const row of readRows<AgentRow>(rowsPath)) latest.set(row.row_key, row);
if (latest.size === 0) {
  process.stderr.write(`${rowsPath}: no P8 row to score; nothing written\n`);
  process.exit(1);
}

const scored: AgentRow[] = [];
for (const row of latest.values()) {
  const fixture = fixtures.get(row.fixture);
  if (fixture === undefined) throw new Error(`row ${row.run_id}: fixture ${row.fixture} is not in ${setPath}`);
  scored.push(existsSync(row.dir) ? assembleRow(row, fixture, ctx) : row);
}
const missingDirs = scored.filter((row) => !existsSync(row.dir)).map((row) => row.run_id);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'agents.scored.jsonl'), scored.map((row) => JSON.stringify(row)).join('\n') + (scored.length > 0 ? '\n' : ''));
const readings = agentReadings(scored, overheadMs);
writeFileSync(join(outDir, 'agent-readings.json'), `${JSON.stringify({ rows: scored.length, missing_run_dirs: missingDirs, readings }, null, 2)}\n`);

const all = readings.find((r) => r.exclusion === 'all')!;
for (const cell of all.cells) {
  process.stdout.write(`${cell.agent}/${cell.arm}: task_pass ${cell.task_pass}/${cell.runs}, fixtures ${cell.fixtures_pass}/${cell.fixtures}, `
    + `T_agent p50 ${Math.round(cell.T_agent_p50)} ms, cost p50 ${cell.cost_p50 === null ? 'n/a' : `$${cell.cost_p50.toFixed(3)}`}, `
    + `harm ${cell.harm}, refsure_used ${cell.refsure_used}\n`);
}
for (const pair of all.paired) process.stdout.write(`${pair.agent}: ${Object.values(pair.statements).join('; ')}\n`);
if (missingDirs.length > 0) process.stdout.write(`${missingDirs.length} run dir(s) missing: their stored rows were kept as written\n`);
