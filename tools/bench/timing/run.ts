import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flags, list, need, num, opt } from '../../calibrate/lib/args';
import { armById, holdsPrivateTerm, readArmsFile } from '../lib/arms';
import type { Arm, ArmsFile } from '../lib/arms';
import { armRuntime, askRow, prepare } from '../lib/ask';
import type { ArmRuntime } from '../lib/ask';
import { assertFrozen, assertPinnedSource, readFreezeTable } from '../lib/freeze';
import { guardLine, readKeySpend, RunnerGuards, stopReason } from '../lib/guards';
import { goldChecks, groupOf, isCandidateSite, itemText } from '../lib/items';
import type { OrderLabel } from '../lib/items';
import { isTerminal, latestByKey, ledgerFiles, ledgerPath, openLedger, readRows, rowKey } from '../lib/ledger';
import type { LedgerWriter, QualityRow } from '../lib/ledger';
import { BENCH_SEED, seeded, shuffleInPlace } from '../lib/stats';
import { dryDecision, m2Arm, m2Runtime, partArm, routesFor, runDecision } from './decision';
import type { DecisionRow, M2Runtime, Route } from './decision';
import { load1, measureRtt, readBaseline, ROW_HIGH_LOAD, RTT_FACTOR, slowHosts, startGate } from './gate';
import type { GateResult } from './gate';
import type { SampleItem, TimingSample } from './sample';
import { spentSoFar } from './spent';

/*
  P6 (4.3): every row at concurrency 1, 5,000 ms per part, 1 attempt. Repeats are the outer loop; within a repeat
  the sample's items run in an order drawn from mulberry32(FNV-1a(`<seed>:timing:<repeat>`)); per item every M1 arm
  and every M2 route of its site run back to back, the first one rotated by the item's index in that order.
  Candidate sites ask in production's own order (`p0`). Before each repeat M2 gets a fresh state directory with the
  frozen egress fixture. Keys come from `env` (the arms file's key env names). Ledgers: `<out>/P6/<arm>/<set>.jsonl`
  (M1) and `<out>/P6/m2_<combo>/<set>.jsonl` (M2); phase events (start gate, repeats, end RTT) go to
  `<out>/P6/phase.jsonl`. A rerun skips terminal keys; there is no re-ask of failures (they are outcomes, 4.4).
*/

const PHASE = 'P6';
const DEADLINE_MS = 5_000;

type Job = { kind: 'M1'; arm: Arm } | { kind: 'M2'; route: Route };

interface Manifest { planned?: Record<string, number>; pricedPlanUsd?: Record<string, number>; planUsd?: Record<string, number> }

/** One (arm, set) ledger of this run: its writer, the keys already terminal, and the 7.3 count guard. */
interface Lane { writer: LedgerWriter; done: Set<string>; rows: number; planned: number | null }

function phaseEvent(out: string, event: Record<string, unknown>): void {
  mkdirSync(join(out, PHASE), { recursive: true });
  appendFileSync(join(out, PHASE, 'phase.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
}

/** The jobs of one item, rotated so the first is `index mod jobs` (4.3). */
export function jobsFor(item: SampleItem, index: number, m1: readonly Arm[], m2: boolean): Job[] {
  const jobs: Job[] = [
    ...m1.map((arm) => ({ kind: 'M1' as const, arm })),
    ...(m2 ? routesFor(item.site).map((route) => ({ kind: 'M2' as const, route })) : []),
  ];
  const start = jobs.length === 0 ? 0 : index % jobs.length;
  return [...jobs.slice(start), ...jobs.slice(0, start)];
}

/** The items of one repeat in its seeded order. */
export function repeatOrder(sample: TimingSample, repeat: string): SampleItem[] {
  return shuffleInPlace([...sample.items], seeded(`${BENCH_SEED}:timing:${repeat}`));
}

/** `--limit N`: the first N items of the first repeat's order, then asked in every repeat (in that repeat's order). */
export function limitedItems(sample: TimingSample, repeats: readonly string[], limit: number): Set<SampleItem> {
  return new Set(repeatOrder(sample, repeats[0]!).slice(0, limit));
}

function orderOf(item: SampleItem): OrderLabel {
  return isCandidateSite(item.site) ? 'p0' : 'fixed';
}

function jobArm(job: Job): string {
  return job.kind === 'M1' ? job.arm.id : m2Arm(job.route.combo);
}

function keyOf(item: SampleItem, job: Job, repeat: string): string {
  return rowKey({ phase: PHASE, set: item.set, item: item.item.id, site: item.site, arm: jobArm(job), variant: 'shipped', order: orderOf(item), repeat });
}

/** Every `P6/<arm>/<set>` lane this run would open that the manifest gives no planned count (checked before any send). */
export function unplannedLanes(sample: TimingSample, repeats: readonly string[], limit: number, m1: readonly Arm[], withM2: boolean, manifest: Manifest): string[] {
  const kept = limitedItems(sample, repeats, limit);
  const missing = new Set<string>();
  for (const [index, item] of repeatOrder(sample, repeats[0]!).filter((entry) => kept.has(entry)).entries()) {
    for (const job of jobsFor(item, index, m1, withM2)) {
      const lane = `${PHASE}/${jobArm(job)}/${item.set}`;
      if (manifest.planned?.[lane] === undefined) missing.add(lane);
    }
  }
  return [...missing].sort();
}

function readSample(path: string, freeze: string | undefined, dryRun: boolean): TimingSample {
  if (freeze !== undefined) assertFrozen(readFreezeTable(freeze), path);
  else if (!dryRun) throw new Error('missing --freeze: P6 reads only the frozen timing sample (4.3, P3a)');
  const sample = JSON.parse(readFileSync(path, 'utf8')) as TimingSample;
  if (sample.v !== 1 || !Array.isArray(sample.items)) throw new Error(`${path}: not a timing sample`);
  return sample;
}

/** `timing run`: P6. Returns the exit code (0, 3 when a guard stopped it). */
export async function runTiming(args: readonly string[], usage: string): Promise<number> {
  const dryRun = args.includes('--dry-run');
  const v = flags(args.filter((a) => a !== '--dry-run'), ['sample', 'out', 'rtt-baseline', 'freeze', 'manifest', 'modes', 'arms', 'repeats', 'limit'], usage);
  const modes = list(v, 'modes', ['M1', 'M2']);
  if (modes.some((mode) => mode !== 'M1' && mode !== 'M2')) throw new Error('--modes: M1, M2 or both');
  const repeats = Array.from({ length: num(v, 'repeats', 3, usage, { min: 1, max: 9, integer: true }) }, (_, i) => `r${i + 1}`);
  const limit = num(v, 'limit', Infinity, usage, { min: 1, integer: true });
  const commits = assertPinnedSource(undefined, undefined, { requireCleanBench: !dryRun });
  const arms = readArmsFile();
  const m1 = modes.includes('M1') ? list(v, 'arms', arms.arms.map((arm) => arm.id)).map((id) => armById(arms, id)) : [];
  const withM2 = modes.includes('M2');
  const samplePath = need(v, 'sample', usage);
  const sample = readSample(samplePath, opt(v, 'freeze'), dryRun);
  if (sample.arms_sha !== arms.sha) process.stderr.write('note: the arms file changed since the sample was drawn (its X4 terms are re-checked per row)\n');
  for (const entry of sample.items) {
    for (const arm of m1) {
      if (arm.data === 'public' && holdsPrivateTerm(arms, itemText(entry.item))) throw new Error(`sample item ${entry.item.id} holds a private term: the sample must be X4-clean (4.3)`);
    }
  }
  const runtimes = new Map<string, ArmRuntime>(m1.map((arm) => [arm.id, armRuntime(arms, arm)]));
  // One exit listener per ledger writer (lib/ledger.ts): P6 holds one per (arm or route, set).
  process.setMaxListeners(Math.max(process.getMaxListeners(), 200));
  if (dryRun) return dryRunAll(sample, repeats, m1, withM2, runtimes, arms, limit);

  const out = need(v, 'out', usage);
  const manifest = opt(v, 'manifest') ? JSON.parse(readFileSync(opt(v, 'manifest')!, 'utf8')) as Manifest : null;
  if (!manifest || manifest.pricedPlanUsd?.[PHASE] === undefined || manifest.planUsd?.[PHASE] === undefined) {
    throw new Error(`a real run needs --manifest with pricedPlanUsd["${PHASE}"], planUsd["${PHASE}"] and planned["${PHASE}/<arm>/<set>"] (7.3)`);
  }
  const unplanned = unplannedLanes(sample, repeats, limit, m1, withM2, manifest);
  if (unplanned.length > 0) throw new Error(`manifest has no planned count for ${unplanned.map((lane) => `"${lane}"`).join(', ')} (7.3 count guard); nothing was sent`);
  const baseline = readBaseline(need(v, 'rtt-baseline', usage));
  const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;
  const log = (line: string) => process.stderr.write(`${runId}: ${line}\n`);
  const gate = await startGate(arms, baseline, log);
  phaseEvent(out, { event: 'start_gate', run_id: runId, ...gate });
  log(`start gate ${gate.passed ? 'passed' : `timed out, every row flagged ${gate.flags.join(', ')}`} (loadavg1 ${gate.load1})`);
  const ctx = new RunContext(out, arms, manifest, runId, commits, gate, m1, withM2, runtimes);
  const code = await ctx.run(sample, repeats, limit);
  const end = await measureRtt(arms);
  const slow = slowHosts(end, gate.rtt);
  phaseEvent(out, { event: 'end_rtt', run_id: runId, rtt: end, factor: RTT_FACTOR, slow_hosts: slow, slow_gateway: slow.length > 0 });
  ctx.summary();
  return code;
}

/**
 * `--dry-run`: every planned row built and approved, M2 through `decide()`'s own dry run (refsure's `DryRunStop`);
 * one JSON line per (item, job) of the first repeat, then the planned counts. No network; M2's readiness still
 * needs the gateway key env variable to be set (any value: nothing is sent).
 */
async function dryRunAll(sample: TimingSample, repeats: readonly string[], m1: readonly Arm[], withM2: boolean,
  runtimes: Map<string, ArmRuntime>, arms: ArmsFile, limit: number): Promise<number> {
  const m2 = withM2 ? m2Runtime(arms, join(mkdtempIn(), 'm2')) : null;
  const planned = new Map<string, number>();
  let shown = 0;
  const kept = limitedItems(sample, repeats, limit);
  for (const [index, item] of repeatOrder(sample, repeats[0]!).filter((entry) => kept.has(entry)).entries()) {
    shown += 1;
    for (const job of jobsFor(item, index, m1, withM2)) {
      const lane = `${PHASE}/${jobArm(job)}/${item.set}`;
      planned.set(lane, (planned.get(lane) ?? 0) + repeats.length);
      const base = { row_key: keyOf(item, job, repeats[0]!), item: item.item.id, set: item.set, site: item.site, arm: jobArm(job), order: orderOf(item) };
      if (job.kind === 'M1') {
        const p = prepare(runtimes.get(job.arm.id)!, item.item, orderOf(item));
        process.stdout.write(`${JSON.stringify({ ...base, mode: 'M1', digest: p.digest, wire_sha: p.wireSha, req_bytes: p.reqBytes, refused: p.refusal?.cause ?? null })}\n`);
      } else {
        process.stdout.write(`${JSON.stringify({ ...base, mode: 'M2', route: job.route.combo, ...(await dryDecision(m2!, item.item, job.route)) })}\n`);
      }
    }
  }
  process.stderr.write(`dry run: ${shown} items x ${repeats.length} repeats; planned rows per lane:\n${JSON.stringify(Object.fromEntries(planned), null, 2)}\nnothing was sent\n`);
  return 0;
}

function mkdtempIn(): string {
  return mkdtempSync(join(tmpdir(), 'refsure-timing-'));
}

/** One real P6 run: lanes (ledger writers), the 7.3 guards per gateway or direct arm, and the job loop. */
class RunContext {
  private readonly lanes = new Map<string, Lane>();
  private readonly guards = new Map<string, RunnerGuards>();
  private readonly tally = new Map<string, Record<string, number>>();
  private readonly runPriced = { usd: 0 };
  private readonly spent;
  private stopped: string | null = null;

  constructor(
    private readonly out: string, private readonly arms: ArmsFile, private readonly manifest: Manifest,
    private readonly runId: string, private readonly commits: { refsure_commit: string; bench_commit: string },
    private readonly gate: GateResult, private readonly m1: readonly Arm[], private readonly withM2: boolean,
    private readonly runtimes: Map<string, ArmRuntime>,
  ) {
    this.spent = spentSoFar(out, arms);
  }

  /** The guards of one arm (M1 rows of that arm and the M2 parts that carried its tags), made on first use. */
  private guardFor(arm: Arm): RunnerGuards {
    let guard = this.guards.get(arm.id);
    if (!guard) {
      const gatewayUrl = this.arms.gateway?.url;
      const keyInfo = this.arms.keyInfoPath;
      guard = new RunnerGuards({
        results: this.out, phase: PHASE, arm: arm.id, provider: arm.provider, via: arm.via, bucket: null,
        phasePricedPlanUsd: this.manifest.pricedPlanUsd![PHASE]!, phasePlanUsd: this.manifest.planUsd![PHASE]!,
        pricedBeforeUsd: this.spent.priced, phasePricedBeforeUsd: this.spent.byPhase.get(`${PHASE}/final`) ?? 0, runPriced: this.runPriced,
        openrouterBeforeUsd: this.spent.direct.get(arm.id) ?? 0,
        ...(arm.via === 'gateway' && gatewayUrl && keyInfo ? { keySpend: () => readKeySpend(gatewayUrl, keyInfo, arm.keyEnv) } : {}),
      });
      this.guards.set(arm.id, guard);
    }
    return guard;
  }

  /** The lane of (arm, set): opened on first use, its terminal keys read; refuses an arm-set with no planned count. */
  private laneFor(arm: string, set: string, m2: boolean): Lane {
    const id = `${arm}/${set}`;
    let lane = this.lanes.get(id);
    if (!lane) {
      const planned = this.manifest.planned?.[`${PHASE}/${arm}/${set}`];
      if (planned === undefined) throw new Error(`manifest has no planned["${PHASE}/${arm}/${set}"] (7.3 count guard)`);
      const files = ledgerFiles(this.out, PHASE, arm, set);
      const latest = latestByKey<QualityRow>(files);
      const done = new Set<string>();
      for (const [key, row] of latest) {
        if (m2 ? row.status !== 'spend_limit' : isTerminal(row, 1)) done.add(key);
      }
      const rows = files.reduce((sum, file) => sum + readRows(file).length, 0);
      lane = { writer: openLedger(ledgerPath(this.out, PHASE, arm, set)), done, rows, planned };
      this.lanes.set(id, lane);
    }
    return lane;
  }

  /** 7.3 counts: false (and a guard line) once a lane would pass 1.15x its planned rows. */
  private admit(lane: Lane, arm: string, set: string): boolean {
    if (lane.planned !== null && lane.rows >= Math.floor(lane.planned * 1.15)) {
      guardLine(this.out, PHASE, 'count', { arm, set, rows: lane.rows, planned: lane.planned }, `stop ${arm}`);
      this.stopped = 'count guard: 1.15x the planned rows';
      return false;
    }
    return true;
  }

  private count(arm: string, status: string): void {
    const t = this.tally.get(arm) ?? {};
    t[status] = (t[status] ?? 0) + 1;
    this.tally.set(arm, t);
  }

  /** Flags a row carries at send: the start gate's, each named arm's `slow_window`, and `high_load` above 12. */
  private flagsNow(arms: readonly Arm[], withLoad = true): string[] {
    const flags = new Set(this.gate.flags);
    for (const arm of arms) for (const flag of this.guardFor(arm).flags()) flags.add(flag);
    if (withLoad && load1() > ROW_HIGH_LOAD) flags.add('high_load');
    return [...flags];
  }

  async run(sample: TimingSample, repeats: readonly string[], limit: number): Promise<number> {
    const kept = limitedItems(sample, repeats, limit);
    for (const repeat of repeats) {
      const order = repeatOrder(sample, repeat).filter((item) => kept.has(item));
      const m2 = this.withM2 ? m2Runtime(this.arms, join(this.out, PHASE, 'state', `${this.runId}-${repeat}`)) : null;
      phaseEvent(this.out, { event: 'repeat_start', run_id: this.runId, repeat, items: order.length, state_dir: m2?.stateDir ?? null, fixture_sha: m2?.fixtureSha ?? null });
      let m2Index = 0;
      for (const [index, item] of order.entries()) {
        for (const job of jobsFor(item, index, this.m1, this.withM2)) {
          if (this.stopped === null) this.stopped = stopReason(this.out) === null ? null : `STOP file: ${stopReason(this.out)}`;
          if (this.stopped !== null) return this.finish();
          if (job.kind === 'M1') await this.runM1(item, job.arm, repeat, index);
          else m2Index = await this.runM2(m2!, item, job.route, repeat, m2Index);
        }
      }
      phaseEvent(this.out, { event: 'repeat_end', run_id: this.runId, repeat });
    }
    return this.finish();
  }

  private finish(): number {
    for (const lane of this.lanes.values()) lane.writer.close();
    if (this.stopped !== null) process.stderr.write(`${this.runId}: stopped: ${this.stopped}\n`);
    return this.stopped === null ? 0 : 3;
  }

  private async runM1(item: SampleItem, arm: Arm, repeat: string, index: number): Promise<void> {
    const job: Job = { kind: 'M1', arm };
    const key = keyOf(item, job, repeat);
    const lane = this.laneFor(arm.id, item.set, false);
    if (lane.done.has(key) || !this.admit(lane, arm.id, item.set)) return;
    const row = await askRow(this.runtimes.get(arm.id)!, item.item, {
      phase: PHASE, slice: 'final', set: item.set, setSha: item.set_sha, order: orderOf(item), repeat, deadlineMs: DEADLINE_MS,
      maxAttempts: 1, runId: this.runId, concurrency: 1, commits: this.commits, gold: goldChecks(item.item), flags: () => this.flagsNow([arm], false),
    });
    lane.writer.append({ ...row, mode: 'M1', row_index: index });
    lane.done.add(key);
    lane.rows += 1;
    this.count(arm.id, row.status);
    const stop = await this.guardFor(arm).observe(row);
    if (stop !== null) this.stopped = stop;
  }

  /**
   * One M2 Decision. A `spend_limit` abstain is a bench defect (4.3): its row is kept (not terminal) and the Decision
   * re-run once at once; a second one stops the run. Each part feeds the guards of the arm whose tags it carried.
   */
  private async runM2(rt: M2Runtime, item: SampleItem, route: Route, repeat: string, index: number): Promise<number> {
    const job: Job = { kind: 'M2', route };
    const arm = m2Arm(route.combo);
    const key = keyOf(item, job, repeat);
    const lane = this.laneFor(arm, item.set, true);
    if (lane.done.has(key)) return index;
    const partArms = route.combo === 'jev' ? [partArm(this.arms, 'jev', undefined)]
      : route.combo === 'openai' ? [partArm(this.arms, 'openai', route.site === 'presence' ? 'o_s2' : 'o_primary')]
        : [partArm(this.arms, 'jev', undefined), partArm(this.arms, 'openai', 'o_primary')];
    const gold = goldChecks(item.item);
    for (let run = 1; run <= 2; run += 1) {
      if (!this.admit(lane, arm, item.set)) return index;
      const flags = this.flagsNow(partArms);
      const loadavg = load1();
      const decided = await runDecision(rt, item.item, route);
      const row: DecisionRow = {
        row_key: key, run_id: this.runId, phase: PHASE, slice: 'final', mode: 'M2', ts_start: decided.ts_start, ts_end: decided.ts_end,
        set: item.set, set_sha: item.set_sha, item: item.item.id, base: item.item.base, group: groupOf(item.item, item.set),
        origin: item.item.origin ?? 'native', site: item.site, arm, route: route.combo, variant: 'shipped', order: orderOf(item) as 'p0' | 'fixed',
        repeat, row_index: index, gold: gold.gold, alt: gold.alt, risk: item.item.risk,
        status: decided.status, cause: decided.cause, detail: decided.detail, verdict: decided.verdict, maturity: decided.maturity,
        t_decision: decided.t_decision, t_ask_plan: decided.t_ask_plan, timed_out: decided.timed_out, parts: decided.parts,
        wording_hash: decided.wording_hash, family_ok: decided.family_ok, model_changed: decided.model_changed,
        egress_lines: decided.egress_lines, fixture_sha: rt.fixtureSha, deadline_ms: DEADLINE_MS, flags, concurrency: 1, loadavg,
        host: rt.host, arms_sha: this.arms.sha, refsure_commit: this.commits.refsure_commit, bench_commit: this.commits.bench_commit, node: process.version,
      };
      lane.writer.append(row);
      lane.rows += 1;
      this.count(arm, decided.status);
      for (const part of decided.parts) {
        const pseudo = { status: part.status, usd: part.usd, attempts: [{ status: part.status, t_wire: part.t_wire, spent: part.spent, http_status: part.http_status }] };
        const stop = await this.guardFor(armById(this.arms, part.arm)).observe(pseudo);
        if (stop !== null) this.stopped = stop;
      }
      if (decided.status !== 'spend_limit') {
        lane.done.add(key);
        return index + 1;
      }
      guardLine(this.out, PHASE, 'm2_spend_limit', { route: arm, site: item.site, item: item.item.id, repeat, run }, run === 1 ? 're-run the Decision' : 'stop (bench defect)');
      if (run === 2) this.stopped = 'M2 spend_limit twice: the M2 limits do not fit the run (bench defect, 4.3)';
    }
    return index + 1;
  }

  summary(): void {
    for (const [arm, tally] of this.tally) process.stdout.write(`${JSON.stringify({ run_id: this.runId, phase: PHASE, arm, ...tally })}\n`);
  }
}
