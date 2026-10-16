import { createHash, randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { flags, list, need, num, opt } from '../../calibrate/lib/args';
import { readArmsFile } from '../lib/arms';
import { guardLine, stopAll, stopReason } from '../lib/guards';
import { assertFrozen, assertPinnedSource, readFreezeTable, repoRoot, sha256File } from '../lib/freeze';
import { ledgerFiles, ledgerPath, nextResume, openLedger, readRows } from '../lib/ledger';
import type { LedgerWriter } from '../lib/ledger';
import { BENCH_SEED, seeded, shuffleInPlace } from '../lib/stats';
import { fillArgv, shouldRun } from './argv';
import type { StepState } from './argv';
import { openPage, PhaseAbort } from './backend';
import type { RunPage } from './backend';
import { commandFor, readCfgsFile, setupCfgs } from './cfgs';
import type { CfgsFile } from './cfgs';
import { measure, parseLine, readSlice } from './click-log';
import { refFromSnap, runCommand, setServerRun } from './command';
import type { CommandResult } from './command';
import { gradeRun } from './grade';
import { summarize } from './summary';
import type { StepRun } from './grade';
import { BACKENDS, CFGS, loadScenarios } from './scenario';
import type { Backend, CfgId, Scenario } from './scenario';
import { load1, loadFlag, startGate } from './start-gate';
import { helpExit } from '../lib/help';
import { baselineMedians } from '../timing/gate';

/*
  P7, the end-to-end CLI level (protocol 6.1-6.4, 7.4 CLI ledger). Runs refsure's built CLI against the fixture pages,
  concurrency 1, one tab (Orca) or session (agent-browser) per run, 33 scenarios x 4 cfgs x 2 backends x 3 repeats,
  repeats as the outer loop and the order within a repeat drawn from mulberry32(FNV-1a(`<seed>:P7:r<k>`)). Each run
  sets the fixture server's run id, runs its steps, waits 500 ms for async beacons, clears the run id (the two
  answered offsets bracket its click-log slice), closes its page and grades itself (grade.ts). A slice holding
  another run's line, a later line of this run, or a snap ref that matches zero or two lines voids the run, which is
  re-run under a new id. One ledger row per command and one per run.

    run-cli setup     --cfgs <cfgs.json> --gateway-config <owner config.json> --consent-gateway <consent.json>
                      --consent-openrouter <consent.json>
    run-cli preflight --cfgs <cfgs.json> --dist <dist/refsure.mjs> --log <clicks.log> [--backend agent-browser]
                      [--profile <isolated Orca profile id>] [--ab-profiles <dir>] [--only E01,...] [--cfg ...]
    run-cli injection --cfgs <cfgs.json> --out <results> [--n 20]
    run-cli run       --cfgs <cfgs.json> --dist <dist/refsure.mjs> --out <results> --log <clicks.log> --freeze <table>
                      --rtt-baseline <json> [--profile <id>] [--ab-profiles <dir>] [--only E01,...] [--cfg ...]
                      [--backend ...] [--repeats 3] [--limit N] [--timeout-ms 180000] [--no-start-gate]
    run-cli summary   --out <results>                                    6.4 readings -> <results>/e2e/summary.json

  The run stops (exit 3) at a `<results>/STOP` file and writes its guard lines to `<results>/P7/guards.jsonl`; a
  401/403 in any command's envelope writes the STOP file for every runner (7.3).
*/

const USAGE = [
  'usage: run-cli setup --cfgs <f> --gateway-config <f> --consent-gateway <f> --consent-openrouter <f>',
  '       run-cli preflight --cfgs <f> --dist <f> --log <f> [--backend b] [--profile id] [--ab-profiles dir] [--only ids] [--cfg ids]',
  '       run-cli injection --cfgs <f> --out <dir> [--n 20]',
  '       run-cli run --cfgs <f> --dist <f> --out <dir> --log <f> --freeze <f> --rtt-baseline <f> [--profile id] [--ab-profiles dir]',
  '               [--only ids] [--cfg ids] [--backend ids] [--repeats 3] [--limit N] [--timeout-ms 180000] [--no-start-gate]',
  '       run-cli summary --out <dir>',
  '       (preflight, run: [--scenarios <scenarios.json>], default tools/bench/e2e/scenarios.json)',
].join('\n');
helpExit(USAGE);
const PHASE = 'P7';
const READ_DELAY_MS = 500;
const MAX_VOID_RETRIES = 2;

const [mode, ...rest] = process.argv.slice(2);
const noGate = rest.includes('--no-start-gate');
const values = flags(rest.filter((a) => a !== '--no-start-gate'), [
  'cfgs', 'dist', 'out', 'log', 'freeze', 'rtt-baseline', 'profile', 'ab-profiles', 'only', 'cfg', 'backend', 'repeats',
  'limit', 'timeout-ms', 'gateway-config', 'consent-gateway', 'consent-openrouter', 'n', 'scenarios',
], USAGE);
const root = repoRoot();
const say = (line: string): void => { process.stderr.write(`${line}\n`); };

function pickList<T extends string>(name: string, all: readonly T[], fallback: readonly T[] = all): T[] {
  const chosen = list(values, name, fallback);
  const bad = chosen.filter((v) => !(all as readonly string[]).includes(v));
  if (bad.length > 0) {
    say(`--${name}: unknown ${bad.join(', ')}\n${USAGE}`);
    process.exit(64);
  }
  return chosen as T[];
}

function scenarioSet(): { all: Scenario[]; seed: string; repeats: number; files: string[]; path: string } {
  const path = resolve(opt(values, 'scenarios') ?? join(root, 'tools', 'bench', 'e2e', 'scenarios.json'));
  const set = loadScenarios(root, path);
  const only = list(values, 'only', set.scenarios.map((s) => s.id));
  const unknown = only.filter((id) => !set.scenarios.some((s) => s.id === id));
  if (unknown.length > 0) {
    say(`--only: unknown ${unknown.join(', ')}`);
    process.exit(64);
  }
  return { all: set.scenarios.filter((s) => only.includes(s.id)), seed: set.seed, repeats: set.repeats, files: set.files, path };
}

interface Ctx { cfgs: CfgsFile; dist: string; log: string; origin: string; profile?: string; abProfiles?: string; timeoutMs: number }
interface CommandRecord { n: number; argv: string[] | null; skipped: string | null; res: CommandResult | null }
interface Executed {
  run_id: string;
  page: Omit<RunPage, 'close'> | null;
  steps: StepRun[];
  commands: CommandRecord[];
  offsets: { before: number; after: number };
  slice: string[];
  void_reason: string | null;
  ts_start: string;
  ts_end: string;
  loadavg: { start: number; end: number };
}

function newRunId(): string {
  return `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
}

/** One run of one scenario under one cfg and backend; `dry` adds `--dry-run` and ignores step conditions. */
async function execute(sc: Scenario, cfg: CfgId, backend: Backend, ctx: Ctx, dry: boolean): Promise<Executed> {
  const run_id = newRunId();
  const ts_start = new Date().toISOString();
  const loadStart = load1();
  const before = await setServerRun(ctx.origin, ctx.log, run_id);
  let page: RunPage | null = null;
  let void_reason: string | null = null;
  try {
    page = await openPage(backend, `${ctx.origin}${sc.entry}`, run_id, { profile: ctx.profile, abProfiles: ctx.abProfiles });
  } catch (error) {
    if (error instanceof PhaseAbort) {
      await setServerRun(ctx.origin, ctx.log, '').catch(() => undefined);
      throw error;
    }
    void_reason = `page: ${error instanceof Error ? error.message : String(error)}`;
  }
  const done = new Map<number, StepState>();
  const refs = new Map<string, string>();
  const steps: StepRun[] = [];
  const commands: CommandRecord[] = [];
  for (const step of sc.steps) {
    if (page === null || void_reason !== null) break;
    const skip = (why: string): void => {
      done.set(step.n, { ran: false, status: null, exit: null, ticket: null });
      steps.push({ n: step.n, ran: false, envelope: null, exit: null, signal: null, end_ms: Date.now() });
      commands.push({ n: step.n, argv: null, skipped: why, res: null });
    };
    if (!dry && !shouldRun(step.run, done)) {
      skip(`condition ${JSON.stringify(step.run)}`);
      continue;
    }
    const filled = fillArgv(step, done, refs, dry);
    if ('missing' in filled) {
      skip(`no value for ${filled.missing}`);
      continue;
    }
    const argv = [...filled.argv, '--page', page.id, ...(dry ? ['--dry-run'] : [])];
    const cmd = commandFor(ctx.cfgs, cfg, backend, ctx.dist, argv);
    const res = await runCommand(cmd.argv, cmd.env, ctx.timeoutMs);
    const ticket = typeof res.envelope?.result?.ticket === 'string' ? res.envelope.result.ticket : null;
    done.set(step.n, { ran: true, status: res.envelope?.status ?? null, exit: res.exit, ticket });
    steps.push({ n: step.n, ran: true, envelope: res.envelope, exit: res.exit, signal: res.signal, end_ms: res.end_ms });
    commands.push({ n: step.n, argv, skipped: null, res });
    for (const [name, want] of Object.entries(step.refs ?? {})) {
      const found = refFromSnap(res.envelope, want.role, want.name);
      if ('defect' in found) void_reason = `fixture defect: ${found.defect}`;
      else refs.set(name, found.ref);
    }
  }
  await sleep(READ_DELAY_MS);
  const after = await setServerRun(ctx.origin, ctx.log, '');
  if (page !== null) await page.close();
  const pageInfo = page === null ? null : { id: page.id, profile: page.profile, profile_dir: page.profile_dir };
  return {
    run_id, page: pageInfo, steps, commands, offsets: { before, after }, slice: readSlice(ctx.log, before, after),
    void_reason, ts_start, ts_end: new Date().toISOString(), loadavg: { start: loadStart, end: load1() },
  };
}

async function serverUp(origin: string): Promise<void> {
  const res = await fetch(`${origin}/clicklog.js`).catch(() => null);
  if (res === null || !res.ok) throw new Error(`no fixture server at ${origin} (start tools/bench/fixture-server.ts)`);
}

function modeSetup(): void {
  const cfgs = readCfgsFile(need(values, 'cfgs', USAGE));
  const written = setupCfgs(cfgs, {
    gatewayConfig: need(values, 'gateway-config', USAGE),
    consent: { gateway: need(values, 'consent-gateway', USAGE), openrouter: need(values, 'consent-openrouter', USAGE) },
  });
  for (const dir of written) process.stdout.write(`${JSON.stringify({ wrote: dir })}\n`);
}

/** 20 x `<keyWrap> true` per distinct wrapper, so `T_cli` can be read net of key injection (6.4). */
async function modeInjection(): Promise<void> {
  const cfgs = readCfgsFile(need(values, 'cfgs', USAGE));
  const n = num(values, 'n', 20, USAGE, { min: 1, max: 200, integer: true });
  const out = openLedger(join(need(values, 'out', USAGE), 'e2e', 'injection.jsonl'));
  try {
    const seen = new Set<string>();
    for (const cfg of CFGS) {
      const wrap = cfgs.cfgs[cfg].keyWrap;
      const id = JSON.stringify(wrap);
      if (wrap.length === 0 || seen.has(id)) continue;
      seen.add(id);
      for (let i = 0; i < n; i += 1) {
        const res = await runCommand([...wrap, 'true'], process.env, 60_000);
        out.append({ kind: 'injection', cfg, i, exit: res.exit, signal: res.signal, t_ms: res.t_cli, ts: new Date(res.end_ms).toISOString(), loadavg: load1() });
      }
    }
  } finally {
    out.close();
  }
}

/**
 * 6.4 preflight: every scenario step under `--dry-run` (no request leaves, no Decision, no click) must answer an
 * envelope that is neither `usage` nor `not_set_up`, every snap ref must resolve, and the click log must stay empty.
 */
async function modePreflight(): Promise<void> {
  const cfgs = readCfgsFile(need(values, 'cfgs', USAGE));
  const ctx: Ctx = {
    cfgs, dist: resolve(need(values, 'dist', USAGE)), log: resolve(need(values, 'log', USAGE)), origin: cfgs.fixtureOrigin,
    profile: opt(values, 'profile'), abProfiles: opt(values, 'ab-profiles'),
    timeoutMs: num(values, 'timeout-ms', 60_000, USAGE, { min: 1000, integer: true }),
  };
  await serverUp(ctx.origin);
  const { all } = scenarioSet();
  const backends = pickList('backend', BACKENDS, ['agent-browser']);
  let bad = 0;
  for (const backend of backends) {
    for (const cfg of pickList('cfg', CFGS)) {
      for (const sc of all) {
        const run = await execute(sc, cfg, backend, ctx, true);
        const problems: string[] = [];
        if (run.void_reason !== null) problems.push(run.void_reason);
        for (const c of run.commands) {
          const status = c.res?.envelope?.status ?? null;
          if (c.res !== null && (status === null || status === 'usage' || status === 'not_set_up')) {
            problems.push(`step ${c.n}: ${status ?? `no envelope (exit ${c.res.exit})`} ${c.res.envelope?.why?.cause ?? ''}`.trim());
          }
          if (c.skipped !== null) problems.push(`step ${c.n}: skipped (${c.skipped})`);
        }
        if (run.slice.length > 0) problems.push(`${run.slice.length} click-log lines under --dry-run`);
        if (problems.length > 0) bad += 1;
        process.stdout.write(`${JSON.stringify({ scenario: sc.id, cfg, backend, ok: problems.length === 0, problems,
          statuses: run.commands.map((c) => c.res?.envelope?.status ?? c.skipped) })}\n`);
      }
    }
  }
  say(`preflight: ${bad} scenario run(s) with problems`);
  process.exitCode = bad > 0 ? 1 : 0;
}

function runKey(sc: string, cfg: string, backend: string, repeat: number): string {
  return createHash('sha256').update([PHASE, 'e2e', sc, cfg, backend, `r${repeat}`].join('\0')).digest('hex');
}

interface Planned { sc: Scenario; cfg: CfgId; backend: Backend; repeat: number; key: string; tries: number }

interface RunContext { pins: { refsure_commit: string; bench_commit: string }; dist_sha256: string; gate: string[]; node: string }

/** The command rows and the run row of one executed run (7.4 CLI ledger). */
function writeRun(out: LedgerWriter, p: Planned, run: Executed, rc: RunContext): string {
  const cell = p.sc.expect[p.cfg];
  const lines = run.slice.map(parseLine);
  const m = measure(p.sc, run.run_id, lines, cell.lines);
  const voidReason = run.void_reason ?? (m.foreign > 0 ? `${m.foreign} click-log line(s) of another run in the slice` : null);
  const graded = voidReason === null ? gradeRun(cell, run.steps, m) : null;
  const flagsOf = [...rc.gate, ...loadFlag(run.loadavg.start)];
  const common = {
    phase: PHASE, run_key: p.key, run_id: run.run_id, scenario: p.sc.id, source: p.sc.source, cfg: p.cfg,
    backend: p.backend, repeat: `r${p.repeat}`, page: run.page, slice: run.slice, offsets: run.offsets,
    loadavg: run.loadavg, flags: flagsOf, ...rc.pins, dist_sha256: rc.dist_sha256, node: rc.node,
  };
  for (const c of run.commands) {
    const env = c.res?.envelope ?? null;
    out.append({
      kind: 'command', row_key: createHash('sha256').update(`${p.key}\0${run.run_id}\0${c.n}`).digest('hex'), ...common,
      step: c.n, argv: c.argv, skipped: c.skipped, exit: c.res?.exit ?? null, signal: c.res?.signal ?? null,
      envelope: env, t_cli: c.res?.t_cli ?? null, t_ask_plan: env?.decision?.ms ?? null,
      t_part: env?.decision?.parts.map((part) => ({ provider: part.provider, ms: part.ms })) ?? null,
      stderr: c.res?.stderr ?? null, ts_end: c.res === null ? null : new Date(c.res.end_ms).toISOString(),
    });
  }
  out.append({
    kind: 'run', row_key: p.key, ...common, ts_start: run.ts_start, ts_end: run.ts_end,
    status: voidReason === null ? 'scored' : 'void', void_reason: voidReason,
    outcome: graded?.outcome ?? null, expected_cell: cell.cell, reasons: graded?.reasons ?? [],
    false_claim: graded?.false_claim ?? null, step_grades: graded?.steps ?? [], measures: m, commands: run.commands.length,
  });
  return voidReason === null ? graded!.outcome : 'void';
}

/** Run keys whose latest run row is scored (a void run is re-run). */
function scoredKeys(files: readonly string[]): Set<string> {
  const latest = new Map<string, { status?: string }>();
  for (const file of files) {
    for (const row of readRows<{ kind?: string; row_key: string; status?: string }>(file)) if (row.kind === 'run') latest.set(row.row_key, row);
  }
  return new Set([...latest].filter(([, row]) => row.status === 'scored').map(([key]) => key));
}

const HTTP_AUTH = /\b40[13]\b/;

/** 7.3: any 401/403 a command reports (`unavailable`, `provider_error`) stops every runner. */
function authRefusal(run: Executed): { step: number; cause: string } | null {
  for (const c of run.commands) {
    const why = c.res?.envelope?.why ?? null;
    if (why !== null && HTTP_AUTH.test(why.detail)) return { step: c.n, cause: why.cause };
  }
  return null;
}

function freezeCheck(table: string, files: readonly string[]): void {
  const frozen = readFreezeTable(table);
  for (const file of files) assertFrozen(frozen, file);
}

async function modeRun(): Promise<void> {
  const pins = assertPinnedSource(root, undefined, { requireCleanBench: true });
  const cfgs = readCfgsFile(need(values, 'cfgs', USAGE));
  const out = resolve(need(values, 'out', USAGE));
  const ctx: Ctx = {
    cfgs, dist: resolve(need(values, 'dist', USAGE)), log: resolve(need(values, 'log', USAGE)), origin: cfgs.fixtureOrigin,
    profile: opt(values, 'profile'), abProfiles: opt(values, 'ab-profiles'),
    timeoutMs: num(values, 'timeout-ms', 180_000, USAGE, { min: 1000, integer: true }),
  };
  const set = scenarioSet();
  const pages = join(root, 'tools', 'bench', 'fixtures', 'pages');
  freezeCheck(need(values, 'freeze', USAGE), [
    set.path, ...set.files.map((f) => join(root, f)), join(pages, 'clicklog.js'), join(pages, 'bench-events.js'),
    ...new Set(set.all.map((sc) => join(pages, sc.entry))),
  ]);
  await serverUp(ctx.origin);
  const cfgList = pickList('cfg', CFGS);
  const backends = pickList('backend', BACKENDS);
  const repeats = num(values, 'repeats', set.repeats, USAGE, { min: 1, max: 9, integer: true });
  const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });

  let gate: string[] = ['no_start_gate'];
  if (!noGate) {
    const baseline = baselineMedians(need(values, 'rtt-baseline', USAGE));
    const urls = readArmsFile().rttUrls;
    const missing = Object.keys(urls).filter((host) => typeof baseline[host] !== 'number');
    if (missing.length > 0) throw new Error(`--rtt-baseline has no P0 value for ${missing.join(', ')}`);
    const result = await startGate(urls, baseline, say);
    say(`start gate: ${JSON.stringify(result)}`);
    gate = result.flags;
    if (gate.length > 0) guardLine(out, PHASE, 'start_gate', result, 'ran after 30 min, rows flagged');
  } else {
    guardLine(out, PHASE, 'start_gate', 'skipped (--no-start-gate)', 'run without the 4.3 gate');
  }

  const files = ledgerFiles(out, 'e2e', 'cli', 'runs');
  const scored = scoredKeys(files);
  const writer = openLedger(ledgerPath(out, 'e2e', 'cli', 'runs', files.length === 0 ? 0 : nextResume(out, 'e2e', 'cli', 'runs')));
  const rc: RunContext = { pins, dist_sha256: sha256File(ctx.dist), gate, node: process.version };
  const queue: Planned[] = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const combos: Planned[] = [];
    for (const sc of set.all) for (const cfg of cfgList) for (const backend of backends) {
      combos.push({ sc, cfg, backend, repeat, key: runKey(sc.id, cfg, backend, repeat), tries: 0 });
    }
    shuffleInPlace(combos, seeded(`${set.seed || BENCH_SEED}:${PHASE}:r${repeat}`));
    queue.push(...combos.filter((p) => !scored.has(p.key)));
  }
  say(`P7: ${queue.length} run(s) to go (${scored.size} already scored)`);
  const counts: Record<string, number> = {};
  let ran = 0;
  let lastAfter = statSync(ctx.log).size;
  let last: { p: Planned; run_id: string } | null = null;
  let stopped: string | null = null;
  const requeue = (p: Planned): void => {
    if (p.tries < MAX_VOID_RETRIES) queue.unshift({ ...p, tries: p.tries + 1 });
  };
  // A line logged between one run clearing its id and the next setting its own came from the earlier run's
  // page after its slice closed: that run is void (6.1) and is re-run under a new id.
  const voidLate = (to: number): void => {
    const late = readSlice(ctx.log, lastAfter, to);
    if (late.length === 0 || last === null) return;
    const { p, run_id } = last;
    writer.append({ kind: 'run', row_key: p.key, phase: PHASE, run_id, scenario: p.sc.id, cfg: p.cfg, backend: p.backend,
      repeat: `r${p.repeat}`, status: 'void', void_reason: `${late.length} click-log line(s) after the run ended`,
      late, offsets: { from: lastAfter, to }, ...rc.pins });
    counts.void = (counts.void ?? 0) + 1;
    say(`${p.sc.id} ${p.cfg} ${p.backend} r${p.repeat}: void (late lines)`);
    requeue(p);
  };
  try {
    while (queue.length > 0 && ran < limit) {
      stopped = stopReason(out);
      if (stopped !== null) {
        guardLine(out, PHASE, 'stop', stopped, 'stop P7 (exit 3)');
        break;
      }
      const p = queue.shift()!;
      const run = await execute(p.sc, p.cfg, p.backend, ctx, false);
      const auth = authRefusal(run);
      if (auth !== null) stopAll(out, PHASE, 'http_auth', { run: run.run_id, scenario: p.sc.id, cfg: p.cfg, ...auth });
      voidLate(run.offsets.before);
      lastAfter = run.offsets.after;
      last = { p, run_id: run.run_id };
      const outcome = writeRun(writer, p, run, rc);
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      ran += 1;
      say(`${p.sc.id} ${p.cfg} ${p.backend} r${p.repeat}: ${outcome}`);
      if (outcome === 'void') requeue(p);
    }
    await sleep(READ_DELAY_MS);
    voidLate(statSync(ctx.log).size);
  } finally {
    writer.close();
  }
  process.stdout.write(`${JSON.stringify({ phase: PHASE, ran, counts, left: queue.length, stopped })}\n`);
  if (stopped !== null) process.exitCode = 3;
  else if ((counts.void ?? 0) > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (mode === 'setup') modeSetup();
  else if (mode === 'injection') await modeInjection();
  else if (mode === 'preflight') await modePreflight();
  else if (mode === 'run') await modeRun();
  else if (mode === 'summary') {
    const results = resolve(need(values, 'out', USAGE));
    if (ledgerFiles(results, 'e2e', 'cli', 'runs').length === 0) {
      say(`${join(results, 'e2e', 'cli', 'runs.jsonl')}: no P7 ledger to read; nothing written`);
      process.exit(1);
    }
    const { path, summary } = summarize(results);
    process.stdout.write(`${JSON.stringify({ wrote: path, cells: Object.keys(summary.readings).length })}\n`);
  }
  else {
    say(USAGE);
    process.exit(64);
  }
}

main().catch((error: unknown) => {
  say(`run-cli: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof PhaseAbort ? 2 : 1);
});
