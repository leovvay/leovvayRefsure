import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join, relative } from 'node:path';
import { openTab } from '../../calibrate/lib/orca-tab';
import { flags, list, need, num, opt } from '../../calibrate/lib/args';
import { assertFrozen, assertPinnedSource, readFreezeTable } from '../lib/freeze';
import { ALL_PHASES_PRICED_STOP_USD, GUARD_USD_PER_CALL, guardLine, stopAll, stopReason } from '../lib/guards';
import { readArmsFile } from '../lib/arms';
import { spentSoFar } from '../timing/spent';
import { readRows } from '../lib/ledger';
import { BENCH_SEED, nearestRank, seeded, shuffleInPlace } from '../lib/stats';
import { Broker } from './broker-client';
import { setServerRun } from './clicklog';
import { AGENT_ARMS, AGENTS, agentFile, readAgentsConfig } from './config';
import type { AgentArm, AgentId, LoadedAgentsConfig } from './config';
import { promptFor, readFixtures, readPrompts } from './fixtures';
import type { Fixture, Prompts } from './fixtures';
import { isolationBefore, isolationCheck } from './isolation';
import { assertAgentFilesFrozen, assertAgentVersions } from './pins';
import type { AgentVersions, PinnedFiles } from './pins';
import { agentRowKey, assembleContext, assembleRow } from './row';
import type { AgentRow, AgentRunFacts, AssembleContext, RunKind } from './row';
import { loadSkills, makeRunDir, newRunId } from './run-dir';
import type { RunDir, Skills } from './run-dir';
import { readShimLog } from './scoring';
import { agentCommand, agentEnv, runAgent } from './spawn-agent';
import { readClaude, readCodex } from './transcript';
import { HIGH_LOAD, startGate } from './start-gate';
import { helpExit } from '../lib/help';

/*
  P8, the agent level (6.5, 7.1, 7.3, 7.4). Subcommands:

    run-agents preflight --set <n12.jsonl> --freeze <table> --out <results> --clicks <clicks.log>
    run-agents dry       (same flags)  one timed dry pass: 2 runs per agent, rows `kind: dry`
    run-agents run       (same flags) [--repeats 3] [--rtt-baseline <json>] [--no-gate] [--limit N] [--agents a,b]
    every subcommand but overhead also takes [--manifest <json>] (`pricedPlanUsd.P8`, else the 7.2 P8 plan)
    run-agents overhead  --out <results>   20 `refsure --help` through the shim minus 20 direct (P0)

  `REFSURE_BENCH_AGENTS` names the agent config (outside every repo). The harness itself runs with the agent
  credential named by `claude.credential.from` in its environment and nothing else secret; it starts the broker
  through `broker.launcher`, which gives refsure's key to the broker alone. Rows go to `<results>/P8/agents.jsonl`
  (one per run, resumable by `row_key`); a run whose click-log slice shows a harness defect is void and re-run
  under a new id; a run that bypassed the shims stops the phase. `REFSURE_BENCH_ARMS` names the arms file, read only
  to price the gateway ledgers of other phases (7.3). Exit 3 = a guard stopped the phase, 4 = the isolation check
  failed, 64 = bad usage.
*/

const USAGE = 'usage: run-agents preflight|dry|run|overhead --out <results> [--set <n12.jsonl> --freeze <table> --clicks <clicks.log>] [--manifest <json>] [--repeats 3] [--rtt-baseline <json>] [--no-gate] [--limit N] [--agents claude,codex]';
helpExit(USAGE);
const PHASE = 'P8';
const P8_STOP_USD = 60;
const PLANNED_REPEATS = 3;
const SLICE_DELAY_MS = 500;
const HARNESS_RERUNS = 2;

const [sub, ...rest] = process.argv.slice(2);
if (!['preflight', 'dry', 'run', 'overhead'].includes(sub ?? '')) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(64);
}
const noGate = rest.includes('--no-gate');
const values = flags(rest.filter((a) => a !== '--no-gate'), ['set', 'freeze', 'out', 'clicks', 'manifest', 'repeats', 'rtt-baseline', 'limit', 'agents'], USAGE);
const out = need(values, 'out', USAGE);
const phaseDir = join(out, PHASE);
mkdirSync(phaseDir, { recursive: true });
const repeats = num(values, 'repeats', PLANNED_REPEATS, USAGE, { min: 1, max: PLANNED_REPEATS, integer: true });
const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
const agents = list(values, 'agents', AGENTS).filter((a): a is AgentId => (AGENTS as readonly string[]).includes(a));

const log = (line: string) => process.stderr.write(`${new Date().toISOString()} ${line}\n`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

class PhaseStop extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

interface Context {
  loaded: LoadedAgentsConfig;
  commits: { refsure_commit: string; bench_commit: string };
  fixtures: Fixture[];
  setId: string;
  setSha: string;
  prompts: Prompts;
  promptsSha: string;
  skills: Skills;
  clicks: string;
  ledger: string;
  assemble: AssembleContext;
  flags: string[];
  pinned: PinnedFiles;
  versions: AgentVersions;
  spend: SpendPlan;
}

/** 7.3 gateway spend for P8: its own 3x-priced plan (stop at 1.5x) and every other phase's priced sum (stop at $60). */
interface SpendPlan { phasePricedPlanUsd: number; source: string; pricedBeforeUsd: number }

/** 7.2's P8 row (~250 Jev and ~180 OpenAI calls) at the 3x guard values, when no manifest names P8's plan. */
const P8_PRICED_PLAN_USD = 250 * GUARD_USD_PER_CALL.jev + 180 * GUARD_USD_PER_CALL.openai;

function spendPlan(): SpendPlan {
  const path = opt(values, 'manifest');
  const manifest = path === undefined ? null : JSON.parse(readFileSync(path, 'utf8')) as { pricedPlanUsd?: Record<string, number> };
  const fromManifest = manifest?.pricedPlanUsd?.[PHASE];
  if (path !== undefined && typeof fromManifest !== 'number') throw new PhaseStop(`--manifest has no pricedPlanUsd["${PHASE}"] (7.3)`, 64);
  return {
    phasePricedPlanUsd: fromManifest ?? P8_PRICED_PLAN_USD,
    source: fromManifest === undefined ? '7.2 P8 plan at 3x' : 'manifest',
    pricedBeforeUsd: spentSoFar(out, readArmsFile()).priced,
  };
}

/** Every run asserts the A3 pin, a frozen set, frozen prompts and a frozen agent config before anything starts. */
function loadContext(): Context {
  const commits = assertPinnedSource(undefined, undefined, { requireCleanBench: true });
  const loaded = readAgentsConfig();
  const setPath = need(values, 'set', USAGE);
  const table = readFreezeTable(need(values, 'freeze', USAGE));
  const setSha = assertFrozen(table, setPath);
  const promptsPath = agentFile('prompts.json');
  const promptsSha = assertFrozen(table, promptsPath);
  assertFrozen(table, loaded.path);
  const fixtures = readFixtures(setPath);
  const prompts = readPrompts(promptsPath);
  for (const fixture of fixtures) promptFor(prompts, fixture, 'page-check');
  const pinned = assertAgentFilesFrozen(table, loaded.config);
  const versionHome = join(loaded.config.runRoot, '.version-home');
  mkdirSync(versionHome, { recursive: true, mode: 0o700 });
  const versions = assertAgentVersions(loaded.config, versionHome);
  return {
    loaded, commits, fixtures, prompts, promptsSha, setSha,
    setId: setPath.split('/').pop()!.replace(/\.jsonl$/, ''),
    skills: loadSkills(loaded.config),
    clicks: need(values, 'clicks', USAGE),
    ledger: join(phaseDir, 'agents.jsonl'),
    assemble: assembleContext(loaded.config),
    flags: [],
    pinned, versions,
    spend: spendPlan(),
  };
}

function ledgerRows(path: string): AgentRow[] {
  return existsSync(path) ? readRows<AgentRow>(path) : [];
}

/** 7.3: the summed agent cost of P8 (every kind of run) stops P8 at $60. */
function p8Spend(rows: readonly AgentRow[]): number {
  return rows.reduce((sum, row) => sum + (row.agent === 'claude' ? row.agent_usd ?? 0 : 0), 0);
}

/** 7.3: P8's refsure calls priced at the 3x guard values (rows before this field: every call at the OpenAI value). */
function p8Priced(rows: readonly AgentRow[]): number {
  return rows.reduce((sum, row) => sum + (row.refsure_cost.guard_usd ?? row.refsure_cost.calls * GUARD_USD_PER_CALL.openai), 0);
}

function checkStops(ctx: Context): void {
  const stop = stopReason(out);
  if (stop !== null) throw new PhaseStop(`STOP file: ${stop}`, 3);
  const rows = ledgerRows(ctx.ledger);
  const spent = p8Spend(rows);
  if (spent >= P8_STOP_USD) {
    guardLine(out, PHASE, 'agent_spend', spent, 'stop P8');
    throw new PhaseStop(`P8 agent spend $${spent.toFixed(2)} reached $${P8_STOP_USD}`, 3);
  }
  const priced = p8Priced(rows);
  const { phasePricedPlanUsd: plan, source, pricedBeforeUsd } = ctx.spend;
  if (priced > 1.5 * plan) {
    guardLine(out, PHASE, 'priced_phase', { sum: priced, plan, source }, 'stop P8 (exit 3)');
    throw new PhaseStop(`P8 priced gateway sum $${priced.toFixed(4)} exceeds 1.5x its 3x-priced plan $${plan.toFixed(4)}`, 3);
  }
  if (pricedBeforeUsd + priced >= ALL_PHASES_PRICED_STOP_USD) {
    stopAll(out, PHASE, 'priced_all', pricedBeforeUsd + priced);
    throw new PhaseStop(`priced gateway sum over all phases reached $${ALL_PHASES_PRICED_STOP_USD}`, 3);
  }
}

/**
 * 7.3 after each run: any 401/402/403 from refsure's provider (in the run's egress-log window or named by an
 * envelope) stops every runner, and so does a 429 whose text says the quota or budget is spent.
 */
function checkRunGuards(row: AgentRow, bypassStops = true): void {
  const envelopes = readShimLog(row.shim_log).map((line) => line.envelope?.why).filter((why) => why != null);
  const refused = [...row.refsure_cost.key_refused ?? [], ...envelopes.flatMap((why) => why.http ?? []).filter((code) => code === 401 || code === 402 || code === 403).map((code) => `http_${code}`)];
  if (refused.length > 0) {
    stopAll(out, PHASE, 'auth', { run: row.run_id, status: [...new Set(refused)] });
    throw new PhaseStop(`run ${row.run_id}: refsure's provider answered ${[...new Set(refused)].join(', ')}; every runner stops`, 3);
  }
  if (envelopes.some((why) => why.spent === true)) {
    stopAll(out, PHASE, 'quota_spent', { run: row.run_id });
    throw new PhaseStop(`run ${row.run_id}: a 429 says the quota or budget is spent; every runner stops`, 3);
  }
  if (bypassStops && (row.void ?? '').includes('shim_bypass')) {
    guardLine(out, PHASE, 'shim_bypass', { run: row.run_id, void: row.void }, 'stop P8 (exit 3)');
    throw new PhaseStop(`run ${row.run_id} bypassed the shims (${row.void}); P8 stops until the run directory is fixed`, 3);
  }
}

/** Exact-value scan of a run's files for the harness's own credential (the broker scans for refsure's). */
function scanFor(dir: string, value: string): string[] {
  if (value.length < 8) return [];
  const needle = Buffer.from(value, 'utf8');
  const hits: string[] = [];
  const walk = (path: string) => {
    // lstat: the run's `bin/node` symlink is never followed into the node binary.
    const st = lstatSync(path, { throwIfNoEntry: false });
    if (st === undefined) return;
    if (st.isDirectory()) for (const name of readdirSync(path)) walk(join(path, name));
    else if (st.isFile() && readFileSync(path).includes(needle)) hits.push(relative(dir, path));
  };
  walk(dir);
  return hits;
}

interface Cell { kind: RunKind; agent: AgentId; arm: AgentArm; fixture: Fixture; repeat: string; cell: number }

const orcaEnv = (ctx: Context) => ({ ...process.env, ORCA_CLI_BIN_DIR: dirname(ctx.loaded.config.orca.bin) });

/**
 * One agent run: fresh run id, run directory and tab; the broker bound to that tab; the agent under its wall limit;
 * the click-log slice read 500 ms after exit; the tab closed; both credential scans; the row assembled.
 */
async function runCell(ctx: Context, broker: Broker, c: Cell, promptText?: string): Promise<{ row: AgentRow; dir: RunDir }> {
  const config = ctx.loaded.config;
  const runId = newRunId();
  const dir = makeRunDir(config, runId, c.arm, ctx.skills);
  // The offset /__run answers opens the run's slice: lines the tab logs while it loads belong to this run.
  const clicksStart = await setServerRun(config.fixtureBase, ctx.clicks, runId);
  const tab = await openTab(orcaEnv(ctx), { url: `${config.fixtureBase}${c.fixture.entry}`, profile: config.orca.profile, worktree: `id:${config.orca.worktreeId}` });
  if (tab.profile !== config.orca.profile) {
    await tab.close();
    throw new PhaseStop(`tab ${tab.pageId} is not in the isolated profile ${config.orca.profile}`, 3);
  }
  const shimLog = join(dir.out, 'shim.jsonl');
  const token = randomBytes(24).toString('hex');
  await broker.beginRun(runId, tab.pageId, token, shimLog, c.arm === 'rs' ? ['orca', 'refsure'] : ['orca']);
  const prompt = promptText ?? promptFor(ctx.prompts, c.fixture, tab.pageId);
  writeFileSync(join(dir.out, 'prompt.txt'), prompt);
  const env = agentEnv(config, c.agent, dir, { port: broker.port, token });
  const command = agentCommand(config, c.agent, dir, prompt, env);
  const transcript = join(dir.out, 'transcript.jsonl');
  const stderr = join(dir.out, 'stderr.txt');
  const loadStart = loadavg()[0] ?? 0;
  const tsStart = new Date().toISOString();
  let exit;
  try {
    exit = await runAgent(command, dir, transcript, stderr);
  } finally {
    await broker.idle();
  }
  await sleep(SLICE_DELAY_MS);
  // Cleared before the tab closes, so a late pagehide beacon is logged with no run id, outside every slice.
  const clicksEnd = await setServerRun(config.fixtureBase, ctx.clicks, '');
  const tsEnd = new Date().toISOString();
  await tab.close();
  const loadEnd = loadavg()[0] ?? 0;
  const credential = process.env[config.claude.credential.from] ?? '';
  const secretFiles = [...scanFor(dir.root, credential), ...await broker.scan(dir.root)];
  const facts: AgentRunFacts = {
    kind: c.kind,
    row_key: agentRowKey({ set: ctx.setId, fixture: c.fixture.id, agent: c.agent, arm: c.arm, repeat: c.repeat, kind: c.kind }),
    run_id: runId, phase: PHASE, agent: c.agent, arm: c.arm, set: ctx.setId, set_sha: ctx.setSha,
    fixture: c.fixture.id, repeat: c.repeat, cell: c.cell, page: tab.pageId, prompt_sha: sha256(prompt),
    ts_start: tsStart, ts_end: tsEnd, t_start_epoch: exit.t_start_epoch, t_end_epoch: exit.t_end_epoch,
    T_agent_ms: exit.T_agent_ms, exit_code: exit.exit_code, signal: exit.signal, timeout: exit.timeout,
    loadavg_start: Math.round(loadStart * 100) / 100, loadavg_end: Math.round(loadEnd * 100) / 100,
    flags: [...ctx.flags, ...(loadStart > HIGH_LOAD ? ['high_load'] : [])],
    dir: dir.root, transcript, last_message: join(dir.out, 'last.txt'), shim_log: shimLog, stderr,
    clicks: { path: ctx.clicks, start: clicksStart, end: clicksEnd },
    secret_files: secretFiles,
    agents_sha: ctx.loaded.sha, refsure_commit: ctx.commits.refsure_commit, bench_commit: ctx.commits.bench_commit,
    node: process.version,
    pins: c.agent === 'claude'
      ? { model: config.claude.model, version: config.claude.version, effort: config.claude.effort }
      : { model: config.codex.model, version: config.codex.version, effort: config.codex.effort },
    skills_sha: Object.fromEntries(Object.entries(ctx.skills.sha).filter(([name]) => name !== 'refsure' || c.arm === 'rs')),
  };
  if (secretFiles.length > 0) log(`run ${runId}: a credential value was found in ${secretFiles.length} file(s); the run is void (report to the owner)`);
  return { row: assembleRow(facts, c.fixture, ctx.assemble), dir };
}

/**
 * 6.5 order: repeats outer; within a repeat the fixtures in the order drawn from
 * mulberry32(FNV-1a(`refsure-bench-20261016:P8:r<r>`)); per fixture the four (agent, arm) cells back to back, the
 * first rotated by the fixture's index in the frozen set file.
 */
function planCells(ctx: Context, kind: RunKind, reps: number): Cell[] {
  const pairs = agents.flatMap((agent) => AGENT_ARMS.map((arm) => ({ agent, arm })));
  const cells: Cell[] = [];
  for (let r = 1; r <= reps; r += 1) {
    const order = shuffleInPlace([...ctx.fixtures], seeded(`${BENCH_SEED}:${PHASE}:r${r}`));
    for (const fixture of order) {
      const shift = ctx.fixtures.indexOf(fixture) % pairs.length;
      const rotated = [...pairs.slice(shift), ...pairs.slice(0, shift)];
      rotated.forEach((pair, cell) => cells.push({ kind, ...pair, fixture, repeat: `r${r}`, cell }));
    }
  }
  return cells;
}

/** A run the harness, not the agent, spoiled: a click-log defect or a shim bypass. It is re-run under a new id. */
const rerun = (row: AgentRow) => (row.void ?? '').startsWith('harness') || (row.void ?? '').includes('shim_bypass');

/** Keys whose latest row stands: any row except one to re-run. */
function doneKeys(rows: readonly AgentRow[]): Set<string> {
  const latest = new Map<string, AgentRow>();
  for (const row of rows) latest.set(row.row_key, row);
  return new Set([...latest.values()].filter((row) => !rerun(row)).map((row) => row.row_key));
}

async function gate(ctx: Context): Promise<void> {
  if (noGate) {
    guardLine(out, PHASE, 'start_gate', 'skipped (--no-gate)', 'run without the 4.3 gate');
    return;
  }
  const baseline = opt(values, 'rtt-baseline');
  if (baseline === undefined) throw new PhaseStop('--rtt-baseline <json> is required (P0 RTT medians per host), or --no-gate', 64);
  const result = await startGate(baseline, log);
  appendFileSync(join(phaseDir, 'gate.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), ...result })}\n`);
  ctx.flags = result.flags;
  if (!result.passed) guardLine(out, PHASE, 'start_gate', result, 'ran after 30 min, rows flagged');
}

async function runPhase(kind: 'run' | 'dry'): Promise<number> {
  const ctx = loadContext();
  checkStops(ctx);
  await gate(ctx);
  const isolationFile = join(phaseDir, `isolation-${kind}.json`);
  isolationBefore(ctx.loaded.config, isolationFile);
  let cells = planCells(ctx, kind, kind === 'dry' ? 1 : repeats);
  if (kind === 'dry') {
    const first = cells[0]!.fixture;
    cells = cells.filter((c) => c.fixture === first);
  }
  const plannedRuns = planCells(ctx, 'run', PLANNED_REPEATS).length;
  const broker = await Broker.start(ctx.loaded);
  const walls: number[] = [];
  let ran = 0;
  try {
    for (const cell of cells) {
      const rows = ledgerRows(ctx.ledger);
      const key = agentRowKey({ set: ctx.setId, fixture: cell.fixture.id, agent: cell.agent, arm: cell.arm, repeat: cell.repeat, kind });
      if (doneKeys(rows).has(key)) continue;
      if (ran >= limit) break;
      for (let attempt = 0; attempt <= HARNESS_RERUNS; attempt += 1) {
        checkStops(ctx);
        const spawned = rows.filter((row) => row.kind === 'run').length;
        const harnessVoids = rows.filter((row) => row.kind === 'run' && rerun(row)).length;
        if (kind === 'run' && spawned >= plannedRuns + harnessVoids) {
          guardLine(out, PHASE, 'run_count', spawned, 'stop P8');
          throw new PhaseStop(`P8 already spawned ${spawned} runs (planned ${plannedRuns})`, 3);
        }
        const t0 = Date.now();
        const { row } = await runCell(ctx, broker, cell);
        walls.push(Date.now() - t0);
        appendFileSync(ctx.ledger, `${JSON.stringify(row)}\n`, { mode: 0o600 });
        log(`${row.run_id} ${cell.agent}/${cell.arm} ${cell.fixture.id} ${cell.repeat}: pass=${row.score.task_pass} harm=${row.score.harm} T=${Math.round(row.T_agent_ms)}ms${row.void ? ` VOID ${row.void}` : ''}`);
        checkRunGuards(row);
        if (!(row.void ?? '').startsWith('harness')) break;
        guardLine(out, PHASE, 'harness_defect', { run: row.run_id, void: row.void }, attempt < HARNESS_RERUNS ? 're-run under a new id' : 'give up on this cell');
        rows.push(row);
      }
      ran += 1;
    }
  } finally {
    await broker.stop();
  }
  const isolation = isolationCheck(isolationFile);
  writeFileSync(join(phaseDir, `isolation-${kind}.result.json`), `${JSON.stringify(isolation, null, 2)}\n`);
  if (kind === 'dry' && walls.length > 0) {
    const perRun = walls.reduce((a, b) => a + b, 0) / walls.length;
    log(`dry pass: ${walls.length} runs, mean wall ${(perRun / 1000).toFixed(1)} s per run; ${plannedRuns} runs ~ ${((perRun * plannedRuns) / 3_600_000).toFixed(1)} h`);
  }
  if (!isolation.ok) {
    log(`isolation check FAILED (the phase is void): ${isolation.failures.join('; ')}`);
    return 4;
  }
  return 0;
}

interface PreflightCheck { agent: AgentId; arm: AgentArm; run_id: string; skills_source: string; skills: string[] | null; models: string[]; checks: Record<string, boolean>; ok: boolean }

const hasSkill = (names: readonly string[], skill: string) => names.some((n) => n === skill || n.endsWith(`:${skill}`));

/** Runs one shim command the way the agent would: its env and cwd, inside Codex's sandbox for Codex. */
function shimCall(ctx: Context, agent: AgentId, dir: RunDir, env: Record<string, string>, argv: string[]): number {
  const codex = ctx.loaded.config.codex;
  const [cmd, args] = agent === 'codex'
    ? [process.execPath, [join(codex.dir, 'bin', 'codex.js'), 'sandbox', '-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.network_access=true', '--', ...argv]]
    : [argv[0]!, argv.slice(1)];
  const result = spawnSync(cmd, args, { cwd: dir.work, env, encoding: 'utf8', timeout: 120_000 });
  return result.status ?? 1;
}

/**
 * The 6.5 agent preflight (P8, after G0), per agent and arm: one "list the skills you have" run whose init or
 * session record shows refsure in rs only and orca-cli in both (the reply's names when the agent's output carries
 * no skill list, and the result says so); then `orca snapshot` and, in rs, `refsure snap` through the shim with the
 * agent's env (inside Codex's sandbox for Codex); in base, no `refsure` on PATH and the broker refusing it.
 */
async function preflight(): Promise<number> {
  const ctx = loadContext();
  checkStops(ctx);
  const broker = await Broker.start(ctx.loaded);
  const results: PreflightCheck[] = [];
  try {
    for (const agent of agents) {
      for (const arm of AGENT_ARMS) {
        checkStops(ctx);
        const cell: Cell = { kind: 'preflight', agent, arm, fixture: ctx.fixtures[0]!, repeat: 'p', cell: 0 };
        const { row, dir } = await runCell(ctx, broker, cell, ctx.prompts.preflight);
        appendFileSync(ctx.ledger, `${JSON.stringify(row)}\n`, { mode: 0o600 });
        checkRunGuards(row, false);
        const fromRecord = row.skills_seen;
        // Without a skill list in the record, the names come from the whole final message, not only its last line.
        const final = (agent === 'claude' ? readClaude(row.transcript) : readCodex(row.transcript, row.last_message)).final_message;
        const names = fromRecord ?? (final.match(/[A-Za-z0-9:_-]+/g) ?? []);
        const checks: Record<string, boolean> = {
          orca_cli_listed: hasSkill(names, 'orca-cli'),
          refsure_listed_as_expected: hasSkill(names, 'refsure') === (arm === 'rs'),
          not_void: row.void === null,
          // 6.5: the model is read from the agent's own output, so a run whose output names none cannot be checked.
          model_seen: row.models_seen.length > 0 && row.model_ok === true,
        };
        // A login shell's path_helper must not put the real orca before R/bin (A4).
        for (const shell of ['/bin/zsh', '/bin/bash']) {
          const found = spawnSync(shell, ['-l', '-c', 'command -v orca'], { env: agentEnv(ctx.loaded.config, agent, dir, { port: 0, token: 'x' }), cwd: dir.work, encoding: 'utf8' });
          checks[`login_${shell.slice(5)}_finds_shim`] = found.stdout.trim() === join(dir.bin, 'orca');
        }
        const token = randomBytes(24).toString('hex');
        const tab = await openTab(orcaEnv(ctx), { url: `${ctx.loaded.config.fixtureBase}${cell.fixture.entry}`, profile: ctx.loaded.config.orca.profile, worktree: `id:${ctx.loaded.config.orca.worktreeId}` });
        if (tab.profile !== ctx.loaded.config.orca.profile) {
          await tab.close();
          throw new PhaseStop(`tab ${tab.pageId} is not in the isolated profile`, 3);
        }
        await broker.beginRun(`${row.run_id}-shim`, tab.pageId, token, join(dir.out, 'shim-preflight.jsonl'), arm === 'rs' ? ['orca', 'refsure'] : ['orca']);
        const env = agentEnv(ctx.loaded.config, agent, dir, { port: broker.port, token });
        checks.orca_snapshot = shimCall(ctx, agent, dir, env, ['orca', 'snapshot', '--page', tab.pageId]) === 0;
        if (arm === 'rs') checks.refsure_snap = shimCall(ctx, agent, dir, env, ['refsure', 'snap', '--page', tab.pageId]) === 0;
        else checks.refsure_absent = spawnSync('/bin/sh', ['-c', 'command -v refsure'], { env, cwd: dir.work }).status !== 0;
        await broker.idle();
        await tab.close();
        const ok = Object.values(checks).every(Boolean);
        results.push({ agent, arm, run_id: row.run_id, skills_source: fromRecord === null ? 'final message' : 'record', skills: names, models: row.models_seen, checks, ok });
        log(`preflight ${agent}/${arm}: ${ok ? 'ok' : `FAILED ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(', ')}`}`);
      }
    }
  } finally {
    await broker.stop();
  }
  writeFileSync(join(phaseDir, 'preflight.json'), `${JSON.stringify({ time: new Date().toISOString(), versions: ctx.versions, pinned: ctx.pinned, results }, null, 2)}\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

/**
 * P0: broker overhead = median of 20 `refsure --help` through the shim minus the median of 20 direct, in ms. Needs
 * no tab, no set and no model call; the broker still starts through its launcher.
 */
async function overhead(): Promise<number> {
  const loaded = readAgentsConfig();
  const config = loaded.config;
  const skills = loadSkills(config);
  const runId = `overhead-${newRunId()}`;
  const dir = makeRunDir(config, runId, 'rs', skills);
  const broker = await Broker.start(loaded);
  const token = randomBytes(24).toString('hex');
  // stdin is a pipe held open until the child exits, as an agent's tool may leave it, so any wait on it is timed.
  const time = (cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> => new Promise((resolve, reject) => {
    const t0 = performance.now();
    const child = spawn(cmd, args, { cwd: dir.work, env, stdio: ['pipe', 'ignore', 'ignore'] });
    child.stdin.on('error', () => undefined);
    child.on('error', reject);
    child.on('exit', (code) => {
      const ms = performance.now() - t0;
      child.stdin.destroy();
      if (code !== 0) reject(new Error(`${args.join(' ')} exited ${String(code)}`));
      else resolve(ms);
    });
  });
  const shim: number[] = [];
  const direct: number[] = [];
  try {
    await broker.beginRun(runId, 'overhead', token, join(dir.out, 'shim.jsonl'), ['refsure']);
    const env = { HOME: dir.home, PATH: `${dir.bin}:/usr/bin:/bin`, TMPDIR: dir.tmp, REFSURE_BENCH_BROKER: String(broker.port), REFSURE_BENCH_BROKER_TOKEN: token };
    for (let i = 0; i < 20; i += 1) {
      shim.push(await time(join(dir.bin, 'refsure'), ['--help'], env));
      direct.push(await time(process.execPath, [config.refsure.dist, '--help'], { HOME: dir.home, PATH: '/usr/bin:/bin', TMPDIR: dir.tmp }));
    }
    await broker.idle();
  } finally {
    await broker.stop();
  }
  const result = {
    time: new Date().toISOString(), samples: 20,
    shim_median_ms: nearestRank(shim, 0.5), direct_median_ms: nearestRank(direct, 0.5),
    median_overhead_ms: nearestRank(shim, 0.5) - nearestRank(direct, 0.5), shim_ms: shim, direct_ms: direct,
  };
  writeFileSync(join(phaseDir, 'overhead.json'), `${JSON.stringify(result, null, 2)}\n`);
  log(`broker overhead: ${result.median_overhead_ms.toFixed(1)} ms per call`);
  return 0;
}

try {
  const code = sub === 'overhead' ? await overhead()
    : sub === 'preflight' ? await preflight()
      : await runPhase(sub as 'run' | 'dry');
  process.exit(code);
} catch (error) {
  if (error instanceof PhaseStop) {
    log(error.message);
    process.exit(error.code);
  }
  log(`run-agents: ${(error as Error).message}`);
  process.exit(1);
}
