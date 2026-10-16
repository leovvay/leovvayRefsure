import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { flags, list, need, num, opt } from '../calibrate/lib/args';
import { pool } from '../calibrate/lib/pool';
import { armById, holdsPrivateTerm, readArmsFile } from './lib/arms';
import type { Arm } from './lib/arms';
import { ablationAsserts, ablationFor, ABLATION_VARIANTS } from './lib/ablate';
import { armRuntime, askRow, prepare } from './lib/ask';
import type { Ablation, ArmRuntime } from './lib/ask';
import { DRIFT_VARIANT, driftCounts, driftPlan, priorOf, readPrior } from './lib/drift';
import type { DriftPlan } from './lib/drift';
import { assertFrozen, assertPinnedSource, readFreezeTable, sha256File } from './lib/freeze';
import { GUARD_USD_PER_CALL, RateBucket, RunnerGuards, readKeySpend, stopReason } from './lib/guards';
import { CANDIDATE_ORDERS, goldChecks, isCandidateSite, itemText, pickIds, readIdList, readItems } from './lib/items';
import type { BenchItem, GoldChecks, OrderLabel } from './lib/items';
import { doneKeys, ledgerFiles, ledgerPath, nextResume, openLedger, readRows, rowKey } from './lib/ledger';
import type { LedgerWriter, QualityRow } from './lib/ledger';
import { settleHook } from './lib/settle';
import { BENCH_SEED, seeded, shuffleInPlace } from './lib/stats';
import { helpExit } from './lib/help';

/*
  P4/P5 quality runner (2.1-2.3, 4.1, 7.3, 7.4). Every listed arm asks every item of one frozen set in the orders and
  repeats of 2.3; items run in blocks of 25 per (set, site) and, per block, the arms start in an order drawn from
  mulberry32(FNV-1a(`refsure-bench-20261016:<block id>`)). One ledger file per (phase, arm, set); a rerun skips
  terminal keys, `--resume` re-asks failures into `<set>.resume<N>.jsonl`. `--dry-run` builds and approves every
  row and prints its digests without any network call. Exit 3 = a spend guard stopped the run; 64 = bad usage.
  `--ids <file|a,b>` asks only those items of the frozen set (the T29 recheck), so every row keeps the set's own hash;
  an ids file is itself checked against the freeze table. `--variant drift --prior <file>` is the 2.5 P1 drift
  re-ask (lib/drift.ts): masks off, one o_primary arm, only items whose wire body equals the prior's byte for byte,
  each row carrying `prior` (the prior's answer and p(true) of the same repeat); the rest are listed in
  `<out>/<phase>/drift-bodies.<set>.json` (stderr on a dry run).

    run --phase P4|P4a|P5 --arm jev_gw,oa_s2 --set <items.jsonl> --out <results dir> [--freeze <table>]
        [--set-id ID] [--ids <file|a,b>] [--orders p0,rb1,...] [--repeats 3] [--concurrency 4] [--rpm 480] [--resume]
        [--limit N] [--dry-run] [--manifest <json>] [--variant shipped|recheck|drift|W0..] [--prior <file>]
        [--deadline-ms 15000] [--attempts 3]
*/

const USAGE = 'usage: run --phase P4|P4a|P5 --arm a[,b] --set <items.jsonl> --out <dir> [--freeze <table>] [--set-id ID] [--ids <file|a,b>] [--orders p0,rb1,..] [--repeats 3] [--concurrency 4] [--rpm 480] [--resume] [--limit N] [--dry-run] [--manifest <json>] [--variant shipped|recheck|drift|W0|W1|W2|W3|C1|K] [--prior <file>] [--deadline-ms 15000] [--attempts 3]';
helpExit(USAGE);
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const resume = argv.includes('--resume');
const values = flags(argv.filter((a) => a !== '--dry-run' && a !== '--resume'),
  ['phase', 'arm', 'set', 'out', 'freeze', 'set-id', 'ids', 'orders', 'repeats', 'concurrency', 'rpm', 'limit', 'manifest', 'variant', 'prior', 'deadline-ms', 'attempts'], USAGE);
const phaseArg = need(values, 'phase', USAGE);
if (!['P4', 'P4a', 'P5'].includes(phaseArg)) {
  process.stderr.write(`--phase ${phaseArg}: P4, P4a or P5\n${USAGE}\n`);
  process.exit(64);
}
// P4a writes P4's files and keys with `slice: interim` (A1), so final P4 skips its terminal keys.
const phase = phaseArg === 'P4a' ? 'P4' : phaseArg;
const slice = phaseArg === 'P4a' ? 'interim' : 'final';
const armIds = list(values, 'arm', []);
const setPath = need(values, 'set', USAGE);
const out = dryRun ? (opt(values, 'out') ?? '') : need(values, 'out', USAGE);
const setId = opt(values, 'set-id') ?? basename(setPath).replace(/\.jsonl(\.gz)?$/, '');
const orderFilter = list(values, 'orders', [...CANDIDATE_ORDERS, 'fixed']);
const repeats = num(values, 'repeats', 3, USAGE, { min: 1, max: 9, integer: true });
const concurrency = num(values, 'concurrency', 4, USAGE, { min: 1, max: 4, integer: true });
const rpm = num(values, 'rpm', 480, USAGE, { min: 1, integer: true });
const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
const deadlineMs = num(values, 'deadline-ms', 15_000, USAGE, { min: 1 });
const maxAttempts = num(values, 'attempts', 3, USAGE, { min: 1, max: 5, integer: true });
const variant = opt(values, 'variant') ?? 'shipped';
// `shipped` and `recheck` send the shipped request; a 2.5 variant (W0..W3, C1, K) applies lib/ablate.ts's edit;
// `drift` sends the shipped request masks off (2.5 drift since the prior run).
const ablating = (ABLATION_VARIANTS as readonly string[]).includes(variant);
const drifting = variant === DRIFT_VARIANT;
if (variant !== 'shipped' && variant !== 'recheck' && !drifting && !ablating) {
  process.stderr.write(`--variant ${variant}: shipped, recheck, ${DRIFT_VARIANT} or one of ${ABLATION_VARIANTS.join(', ')}\n${USAGE}\n`);
  process.exit(64);
}
/** Exit 64 with a message (a refused precondition). */
function refuse(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}
const priorPath = opt(values, 'prior');
if (drifting !== (priorPath !== undefined)) refuse(`--prior <file> goes with --variant ${DRIFT_VARIANT}, and only with it (2.5)\n${USAGE}`);
if (drifting && phaseArg !== 'P5') refuse(`--variant ${DRIFT_VARIANT}: the 2.5 drift re-ask is a P5 run`);
/** The 2.5 drift rows are built masks off; every other run sends the item's own mask mode. */
const masksOverride = drifting ? false : undefined;
/** The 2.5 edit for this arm, when the run is an ablation run. */
function ablationOf(arm: Arm): Ablation | undefined {
  return ablating ? ablationFor(variant, arm.provider) : undefined;
}
if (armIds.length === 0) {
  process.stderr.write(`missing --arm\n${USAGE}\n`);
  process.exit(64);
}

let commits: { refsure_commit: string; bench_commit: string };
try {
  commits = assertPinnedSource(undefined, undefined, { requireCleanBench: !dryRun });
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(64);
}
const arms = readArmsFile();
const chosen: Arm[] = armIds.map((id) => armById(arms, id));
if (drifting && (chosen.length !== 1 || chosen[0]!.provider !== 'openai' || chosen[0]!.rendering !== 'o_primary')) {
  refuse(`--variant ${DRIFT_VARIANT}: one OpenAI arm at the o_primary rendering (the prior's adapter A wire, 2.5); got ${armIds.join(', ')}`);
}
const freezePath = opt(values, 'freeze');
const table = freezePath === undefined ? null : readFreezeTable(freezePath);
/** The sha256 of an input the run reads besides the set (an ids file, the prior file): frozen, or noted on a dry run. */
function frozenInput(path: string, what: string): string {
  if (table === null) {
    const sha = sha256File(path);
    process.stderr.write(`note: no --freeze; a real run refuses an unfrozen ${what} file (sha256 ${sha.slice(0, 12)})\n`);
    return sha;
  }
  try {
    return assertFrozen(table, path);
  } catch (error) {
    return refuse(`${what}: ${(error as Error).message}`);
  }
}
let setSha: string;
if (table !== null) setSha = assertFrozen(table, setPath);
else if (dryRun) {
  setSha = sha256File(setPath);
  process.stderr.write(`note: no --freeze; a real run refuses an unfrozen set (sha256 ${setSha.slice(0, 12)})\n`);
} else {
  process.stderr.write(`missing --freeze: a run reads only frozen sets (3.1)\n${USAGE}\n`);
  process.exit(64);
}

interface Manifest { planned?: Record<string, number>; pricedPlanUsd?: Record<string, number>; planUsd?: Record<string, number> }
const manifest: Manifest = opt(values, 'manifest') ? JSON.parse(readFileSync(opt(values, 'manifest')!, 'utf8')) as Manifest : {};
// 7.3: a real run arms the count, priced-phase and key-spend guards from the manifest, or refuses to start.
if (!dryRun) {
  const missing: string[] = [];
  if (opt(values, 'manifest') === undefined) missing.push('--manifest');
  for (const arm of chosen) {
    if (manifest.planned?.[`${phaseArg}/${arm.id}/${setId}`] === undefined) missing.push(`planned["${phaseArg}/${arm.id}/${setId}"]`);
  }
  if (chosen.some((arm) => arm.via === 'gateway')) {
    if (manifest.pricedPlanUsd?.[phaseArg] === undefined) missing.push(`pricedPlanUsd["${phaseArg}"]`);
    if (manifest.planUsd?.[phaseArg] === undefined) missing.push(`planUsd["${phaseArg}"]`);
    if (!arms.keyInfoPath) process.stderr.write('note: the arms file names no keyInfoPath; the measured key-spend guard is off (7.3)\n');
  }
  if (missing.length > 0) {
    process.stderr.write(`a real run needs its manifest entries (7.3 guards): missing ${missing.join(', ')}\n${USAGE}\n`);
    process.exit(64);
  }
}

let picked = readItems(setPath);
const idsArg = opt(values, 'ids');
if (idsArg !== undefined) {
  // T29: the recheck asks some items of a frozen P4a set, so its rows keep that set's own hash (9.2).
  try {
    const { ids, file } = readIdList(idsArg);
    if (file !== null) frozenInput(file, '--ids');
    picked = pickIds(picked, ids);
  } catch (error) {
    refuse((error as Error).message);
  }
}
const items = picked.slice(0, limit);
if (drifting) {
  const other = items.find((item) => item.site !== 'presence');
  if (other) refuse(`--variant ${DRIFT_VARIANT}: item ${other.id} is ${other.site}; the 2.5 drift re-ask builds the presence site only`);
}
if (ablating) {
  // P0 (2.5): W0 must be the shipped presence instruction and the shipped question must carry criteria.
  const asserts = ablationAsserts();
  if (asserts.length > 0) {
    process.stderr.write(`--variant ${variant}: the 2.5 ablation asserts fail:\n${asserts.join('\n')}\n`);
    process.exit(64);
  }
  // 2.5: presence items only; C1 on OpenAI arms only (Jev requires criteria). Refused before anything is built.
  const other = items.find((item) => item.site !== 'presence');
  if (other) {
    process.stderr.write(`--variant ${variant}: item ${other.id} is ${other.site}; the 2.5 ablation is presence only\n`);
    process.exit(64);
  }
  for (const arm of chosen) {
    try {
      ablationFor(variant, arm.provider);
    } catch (error) {
      process.stderr.write(`${arm.id}: ${(error as Error).message}\n`);
      process.exit(64);
    }
  }
}
const gold = new Map<string, GoldChecks>(items.map((item) => [item.id, goldChecks(item)]));
const twins = items.filter((item) => gold.get(item.id)!.goldTwin);
if (twins.length > 0) process.stderr.write(`X1: ${twins.length} gold-twin items are settle-layer only and not asked\n`);
const runtimes = new Map<string, ArmRuntime>(chosen.map((arm) => [arm.id, armRuntime(arms, arm)]));
// 2.5 drift: every item built masks off and its wire body compared with the prior's; only byte-identical ones are asked.
let drift: DriftPlan | null = null;
let priorSha = '';
if (drifting) {
  priorSha = frozenInput(priorPath!, '--prior');
  let prior: ReturnType<typeof readPrior>;
  try {
    prior = readPrior(priorPath!);
  } catch (error) {
    refuse((error as Error).message);
  }
  drift = driftPlan(runtimes.get(chosen[0]!.id)!, items.filter((item) => !gold.get(item.id)!.goldTwin), prior);
}
const asked = items.filter((item) => !gold.get(item.id)!.goldTwin && (drift === null || drift.same.has(item.id)));
/** The `prior` a drift row carries (2.5); undefined on every other run. */
function priorField(item: BenchItem, repeat: string): unknown {
  return drift === null ? undefined : priorOf(drift.prior.get(item.id), repeat, priorSha);
}
/** The 2.5 listing of the bodies not asked: written beside the phase's ledgers, or to stderr on a dry run. */
function driftListing(): Record<string, unknown> | null {
  if (drift === null) return null;
  return { what: '2.5 drift: masks-off wire body vs the prior stored body, byte for byte', set: setId, set_sha: setSha,
    prior_sha256: priorSha, arm: chosen[0]!.id, masks: false, counts: driftCounts(drift.checks),
    listed: drift.checks.filter((check) => check.result !== 'same') };
}

/** The (order, repeat) pairs of 2.3 for one item, filtered by --orders. */
function plan(item: BenchItem): { order: OrderLabel; repeat: string }[] {
  const reps = Array.from({ length: repeats }, (_, i) => `r${i + 1}`);
  const pairs: { order: OrderLabel; repeat: string }[] = isCandidateSite(item.site)
    ? [...reps.map((repeat) => ({ order: 'p0' as const, repeat })), ...CANDIDATE_ORDERS.slice(1).map((order) => ({ order, repeat: 'r1' }))]
    : reps.map((repeat) => ({ order: 'fixed' as const, repeat }));
  return pairs.filter((pair) => orderFilter.includes(pair.order));
}

/** Blocks of 25 items per (set, site), in file order. */
const blocks: { id: string; items: BenchItem[] }[] = [];
for (const site of [...new Set(asked.map((item) => item.site))]) {
  const ofSite = asked.filter((item) => item.site === site);
  for (let i = 0; i < ofSite.length; i += 25) blocks.push({ id: `${setId}:${site}:${i / 25}`, items: ofSite.slice(i, i + 25) });
}

const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`;

/** The arms' start order for one block (2.3). */
function armOrder(blockId: string): Arm[] {
  return shuffleInPlace([...chosen], seeded(`${BENCH_SEED}:${blockId}`));
}

/** X4: a `public` arm never receives an item holding a private term (askRow and prepare also refuse one). */
function allowed(arm: Arm, item: BenchItem): boolean {
  return arm.data === 'all' || !holdsPrivateTerm(arms, itemText(item));
}

if (dryRun) {
  let rows = 0;
  let withheld = 0;
  for (const block of blocks) {
    for (const arm of armOrder(block.id)) {
      const rt = runtimes.get(arm.id)!;
      for (const item of block.items) {
        if (!allowed(arm, item)) {
          withheld += 1;
          continue;
        }
        for (const { order, repeat } of plan(item)) {
          const p = prepare(rt, item, order, ablationOf(arm), { masks: masksOverride });
          rows += 1;
          process.stdout.write(`${JSON.stringify({
            row_key: rowKey({ phase, set: setId, item: item.id, site: item.site, arm: arm.id, variant, order, repeat }),
            block: block.id, set: setId, item: item.id, site: item.site, arm: arm.id, order, repeat, host: rt.endpoint.host,
            digest: p.digest, qdigest: p.qdigest, wire_sha: p.wireSha, req_bytes: p.reqBytes,
            threshold: p.threshold.threshold, threshold_source: p.threshold.source,
            gold: gold.get(item.id)!.gold, ...(p.refusal ? { refused: p.refusal.cause } : {}),
            ...(drift === null ? {} : { masks: false, prior: priorField(item, repeat) }),
          })}\n`);
        }
      }
    }
  }
  const listing = driftListing();
  if (listing !== null) {
    for (const check of listing.listed as { item: string; result: string; first_diff: number | null }[]) {
      process.stderr.write(`drift body ${check.result}: ${check.item}${check.first_diff === null ? '' : ` at byte ${check.first_diff}`}\n`);
    }
    process.stderr.write(`drift: ${JSON.stringify(listing.counts)} (masks off on ${chosen[0]!.id}; only byte-identical bodies are asked)\n`);
  }
  process.stderr.write(`dry run: ${rows} rows built, ${withheld} item-arm pairs withheld by X4, ${twins.length} X1 items; nothing was sent\n`);
  process.exit(0);
}

/**
 * Priced sums over every gateway ledger already in `out` (7.3): in all, and per `<phase dir>/<slice>` (P4a rows are
 * `P4/interim`, apart from final P4); and OpenRouter `usage.cost` per direct arm.
 */
function spentSoFar(): { priced: number; byPhase: Map<string, number>; direct: Map<string, number> } {
  let priced = 0;
  const byPhase = new Map<string, number>();
  const direct = new Map<string, number>();
  for (const ph of ['P4', 'P5', 'P6']) {
    for (const arm of arms.arms) {
      const dir = join(out, ph, arm.id);
      if (!existsSync(dir)) continue;
      const sets = new Set(readdirNames(dir).map((name) => name.replace(/(\.resume\d+)?\.jsonl(\.gz)?$/, '')));
      for (const set of sets) {
        for (const file of ledgerFiles(out, ph, arm.id, set)) {
          for (const row of readRows<QualityRow>(file)) {
            if (arm.via === 'gateway') {
              const usd = row.attempts.length * GUARD_USD_PER_CALL[arm.provider];
              const at = `${ph}/${row.slice ?? 'final'}`;
              priced += usd;
              byPhase.set(at, (byPhase.get(at) ?? 0) + usd);
            } else direct.set(arm.id, (direct.get(arm.id) ?? 0) + (row.usd ?? 0));
          }
        }
      }
    }
  }
  return { priced, byPhase, direct };
}

function readdirNames(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((name) => /\.jsonl(\.gz)?$/.test(name)) : [];
}

const spent = spentSoFar();
/** This process's priced sum over every lane: with the phase's earlier rows it makes the phase sum (7.3). */
const runPriced = { usd: 0 };
const buckets = new Map<string, RateBucket>();
function bucketFor(arm: Arm): RateBucket {
  const name = arm.via === 'gateway' ? 'gateway' : `direct-${arm.id}`;
  if (!buckets.has(name)) buckets.set(name, new RateBucket(out, name, rpm));
  return buckets.get(name)!;
}

interface Lane { arm: Arm; rt: ArmRuntime; writer: LedgerWriter; done: Set<string>; guards: RunnerGuards; stopped: string | null; tally: Record<string, number>; familyOk: number; answered: number }
const lanes = new Map<string, Lane>();
for (const arm of chosen) {
  const files = ledgerFiles(out, phase, arm.id, setId);
  const path = resume ? ledgerPath(out, phase, arm.id, setId, nextResume(out, phase, arm.id, setId)) : ledgerPath(out, phase, arm.id, setId);
  const key = `${phaseArg}/${arm.id}/${setId}`;
  const gatewayUrl = arms.gateway?.url;
  lanes.set(arm.id, {
    arm, rt: runtimes.get(arm.id)!, writer: openLedger(path), done: doneKeys(files, { resume, maxAttempts }), stopped: null,
    tally: {}, familyOk: 0, answered: 0,
    guards: new RunnerGuards({
      results: out, phase, arm: arm.id, provider: arm.provider, via: arm.via, bucket: bucketFor(arm),
      ...(manifest.planned?.[key] === undefined ? {} : { plannedRows: manifest.planned[key] }),
      ...(manifest.pricedPlanUsd?.[phaseArg] === undefined ? {} : { phasePricedPlanUsd: manifest.pricedPlanUsd[phaseArg] }),
      ...(manifest.planUsd?.[phaseArg] === undefined ? {} : { phasePlanUsd: manifest.planUsd[phaseArg] }),
      pricedBeforeUsd: spent.priced, phasePricedBeforeUsd: spent.byPhase.get(`${phase}/${slice}`) ?? 0, runPriced,
      openrouterBeforeUsd: spent.direct.get(arm.id) ?? 0,
      ...(arm.via === 'gateway' && gatewayUrl && arms.keyInfoPath
        ? { keySpend: () => readKeySpend(gatewayUrl, arms.keyInfoPath!, arm.keyEnv) } : {}),
    }),
  });
}

const versions = new Map<string, string[]>();
let hourStart = Date.now();
function hourly(force = false): void {
  if (!force && Date.now() - hourStart < 3_600_000) return;
  hourStart = Date.now();
  mkdirSync(join(out, phase), { recursive: true });
  for (const lane of lanes.values()) {
    const line = { time: new Date().toISOString(), run_id: runId, arm: lane.arm.id, set: setId, answered: lane.answered,
      family_ok_share: lane.answered === 0 ? null : lane.familyOk / lane.answered, versions: versions.get(lane.arm.id) ?? [] };
    appendFileSync(join(out, phase, 'hourly.jsonl'), `${JSON.stringify(line)}\n`);
  }
}

async function askOneRow(lane: Lane, item: BenchItem, order: OrderLabel, repeat: string): Promise<void> {
  if (lane.stopped !== null) return;
  const key = rowKey({ phase, set: setId, item: item.id, site: item.site, arm: lane.arm.id, variant, order, repeat });
  if (lane.done.has(key)) return;
  const stop = lane.guards.admit();
  if (stop !== null) {
    lane.stopped = stop;
    return;
  }
  const row = await askRow(lane.rt, item, {
    phase, slice, set: setId, setSha, order, repeat, variant, deadlineMs, maxAttempts, runId, concurrency, commits,
    // flags are read after the bucket gate resolves, i.e. when the row is actually sent (7.3 latency rule).
    gold: gold.get(item.id)!, flags: () => lane.guards.flags(), beforeAttempt: () => lane.guards.attemptGate(),
    ablation: ablationOf(lane.arm), settle: settleHook(lane.arm.model), masks: masksOverride, prior: priorField(item, repeat),
  });
  lane.writer.append(row);
  lane.done.add(key);
  lane.tally[row.status] = (lane.tally[row.status] ?? 0) + 1;
  if (row.family_ok !== null) {
    lane.answered += 1;
    if (row.family_ok) lane.familyOk += 1;
  }
  for (const header of row.attempts.flatMap((a) => a.headers)) {
    for (const [name, value] of Object.entries(header)) {
      const seen = versions.get(lane.arm.id) ?? [];
      if (name.includes('version') && !seen.includes(value)) versions.set(lane.arm.id, [...seen, value]);
    }
  }
  lane.stopped = await lane.guards.observe(row);
  hourly();
}

process.stderr.write(`${runId}: ${phaseArg} ${setId} (${asked.length} items, ${blocks.length} blocks) on ${chosen.map((a) => a.id).join(', ')}${resume ? ' (resume)' : ''}\n`);
const listing = driftListing();
if (listing !== null) {
  // Deterministic for a frozen set, prior file and pinned code: every run (resumes too) rewrites the same listing.
  mkdirSync(join(out, phase), { recursive: true });
  writeFileSync(join(out, phase, `drift-bodies.${setId}.json`), `${JSON.stringify(listing, null, 1)}\n`);
  process.stderr.write(`drift: ${JSON.stringify(listing.counts)}; listing in ${join(out, phase, `drift-bodies.${setId}.json`)}\n`);
}
for (const block of blocks) {
  if (stopReason(out) !== null || [...lanes.values()].every((lane) => lane.stopped !== null)) break;
  // Every arm asks every item of the block; arms start in the block's drawn order and then run side by side.
  await Promise.all(armOrder(block.id).map((arm) => {
    const lane = lanes.get(arm.id)!;
    const jobs = block.items.filter((item) => allowed(arm, item)).flatMap((item) => plan(item).map((pair) => ({ item, ...pair })));
    return pool(jobs, concurrency, ({ item, order, repeat }) => askOneRow(lane, item, order, repeat));
  }));
}
hourly(true);

let exit = 0;
for (const lane of lanes.values()) {
  lane.writer.close();
  const withheld = asked.filter((item) => !allowed(lane.arm, item)).length;
  process.stdout.write(`${JSON.stringify({ run_id: runId, arm: lane.arm.id, set: setId, out: lane.writer.path, ...lane.tally, x4_withheld: withheld,
    ...(drift === null ? {} : { drift: driftCounts(drift.checks) }), stopped: lane.stopped })}\n`);
  if (lane.stopped !== null) {
    process.stderr.write(`${lane.arm.id} stopped: ${lane.stopped}\n`);
    exit = 3;
  }
}
const stop = stopReason(out);
if (stop !== null) {
  process.stderr.write(`STOP file present: ${stop}\n`);
  exit = 3;
}
process.exit(exit);
