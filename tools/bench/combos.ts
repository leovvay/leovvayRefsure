import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { keySet } from '../../src/config';
import { makeProviders } from '../../src/providers';
import type { ComboPart, DecisionProvider, ProviderAnswer } from '../../src/providers';
import { abstainVerdict, BOUNDS, SITES } from '../../src/questions';
import type { ProviderId, SiteId, Verdict } from '../../src/questions';
import { flags, need, num, opt } from '../calibrate/lib/args';
import { armById, holdsPrivateTerm, readArmsFile } from './lib/arms';
import type { Arm, ArmsFile } from './lib/arms';
import { armRuntime, prepare, r1Of, scrubDetail } from './lib/ask';
import { askOne } from './lib/combine-copy/ask-one';
import type { ArmRuntime, Prepared } from './lib/ask';
import {
  combinatorAsserts, combineParts, isProductionShape, parseShape, ProductionDecider, Q2_SHAPES, replayAnswer, replayProvider,
  writeGoldenDiff,
} from './lib/combinator';
import type { AskedLog, ComboShape } from './lib/combinator';
import { assertFrozen, assertPinnedSource, readFreezeTable } from './lib/freeze';
import { RateBucket, stopReason } from './lib/guards';
import { CANDIDATE_ORDERS, isCandidateSite, itemText, readItems, score } from './lib/items';
import type { BenchItem, OrderLabel } from './lib/items';
import { latestByKey, ledgerFiles, openLedger, readRows } from './lib/ledger';
import type { QualityRow, R1Read } from './lib/ledger';
import { settleReplay } from './lib/settle';
import type { ActingPart } from './lib/settle';
import { BENCH_SEED, seeded, shuffleInPlace } from './lib/stats';
import { installWireTap, tapped } from './lib/wire-tap';
import type { WireRecord } from './lib/wire-tap';
import { helpExit } from './lib/help';

/*
  2.4 combos. Offline cells from same-salt single-arm rows: production shapes through refsure's `createDecide` with
  replay providers, research shapes through lib/combinator.ts (`bench_combinator`). A pair whose replayed request
  digest differs from either stored digest (or lacks a part, or has a `family_ok` false part that was asked) is
  dropped and counted. Offline time is an approximation (agree = max, fallback = sum when B was asked); cost is the
  sum of the parts asked. `live` is the P5b check through refsure's real `decide()` with both real providers, with
  the replay gate and the separate-rows gate; `gates` recomputes both from a live ledger without any call.

    combos golden [--write]
    combos replay --results <dir> --items <items.jsonl> --out <dir> --freeze <table> [--phase P4] [--set-id ID]
                  [--combos "agree:a,b fallback:a,b ..."] [--orders p0,rb1,..] [--limit N]
    combos live   --results <dir> --items <a.jsonl,b.jsonl,..> --site dismiss|presence|page-state --out <dir> --freeze <table>
                  [--phase P4] [--set-id A,B,..] [--jev-arm jev_gw] [--openai-arm oa_primary] [--n N] [--min M] [--rpm 480]
                  [--allow-short-branch] [--dry-run]
    combos gates  --live <live.jsonl> --results <dir> --items <a.jsonl,b.jsonl,..> --freeze <table> [--phase P4] [--set-id A,B,..]

  `live` and `gates` pool the primary sets of section 3 (each set's P4 rows read by its own set id). `live` refuses
  (64) a sample short of `n` or of the branch floor unless `--allow-short-branch`; only `live --dry-run` may read an
  unfrozen set, and `--dry-run` applies to `live` only.
*/

const USAGE = 'usage: combos golden [--write] | replay --results <dir> --items <file> --out <dir> --freeze <t> [--phase P4] [--set-id ID] [--combos "agree:a,b ..."] [--orders ..] [--limit N] | live --results <dir> --items <a,b,..> --site <site> --out <dir> --freeze <t> [--n N] [--min M] [--allow-short-branch] [--dry-run] | gates --live <file> --results <dir> --items <a,b,..> --freeze <t>';
helpExit(USAGE);
const [command, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run');
const write = rest.includes('--write');
const allowShortBranch = rest.includes('--allow-short-branch');
const values = flags(rest.filter((a) => a !== '--dry-run' && a !== '--write' && a !== '--allow-short-branch'),
  ['results', 'items', 'out', 'freeze', 'phase', 'set-id', 'combos', 'orders', 'limit', 'site', 'jev-arm', 'openai-arm', 'n', 'min', 'rpm', 'live'], USAGE);

function fail(message: string, code = 64): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Stored rows of one (phase, arm, set), latest per key, `shipped` variant only, by `item \0 order \0 repeat`. */
function storedRows(results: string, phase: string, arm: string, set: string): Map<string, QualityRow> {
  const out = new Map<string, QualityRow>();
  for (const row of latestByKey<QualityRow>(ledgerFiles(results, phase, arm, set)).values()) {
    if (row.variant === 'shipped') out.set(`${row.item}\0${row.order}\0${row.repeat}`, row);
  }
  return out;
}

/** The row unit 5.1 reads: `p0`/`r1` on candidate sites, `fixed`/`r1` elsewhere. */
function unitOrder(item: BenchItem): OrderLabel {
  return isCandidateSite(item.site) ? 'p0' : 'fixed';
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  return values.some((value) => value === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** One part of a combo row: its stored row and whether the combo asked it. */
interface PartRecord {
  arm: string; provider: string; row_key: string | null; asked: boolean; status: string | null; model: string | null;
  family_ok: boolean | null; digest: string | null; r1: R1Read | null;
}

/** One offline combo row (2.4). `dropped` names why a pair is not read; such rows only count. */
export interface ComboRow {
  combo_key: string; run_id: string; source_phase: string; set: string; item: string; base: string; group: string;
  site: string; combo: string; kind: string; label: 'createDecide' | 'bench_combinator'; shape_class: 'production' | 'research';
  order: string; repeat: string; presented: Record<string, number | null> | null;
  gold: string | null; alt: string[]; gold_cut: boolean | null; gold_twin: boolean | null; risk: string | null; danger_eligible: boolean | null;
  dropped: 'missing_part' | 'x4' | 'digest' | 'route' | 'family' | null; route: string | null; digest: string | null; parts: PartRecord[];
  verdict: R1Read | null; correct: boolean | null; dangerous: boolean | null; settle: unknown;
  ms_offline_approx: number | null; usd: number | null; usd_priced: number | null;
  arms_sha: string; refsure_commit: string; bench_commit: string; node: string;
}

interface OfflineCtx {
  file: ArmsFile; phase: string; set: string; runId: string; commits: { refsure_commit: string; bench_commit: string };
  runtimes: Map<string, ArmRuntime>; deciders: Map<string, ProductionDecider>;
}

function runtimeFor(ctx: OfflineCtx, arm: Arm): ArmRuntime {
  if (!ctx.runtimes.has(arm.id)) ctx.runtimes.set(arm.id, armRuntime(ctx.file, arm));
  return ctx.runtimes.get(arm.id)!;
}

function deciderFor(ctx: OfflineCtx, shape: ComboShape, arms: readonly [Arm, Arm]): ProductionDecider {
  if (!ctx.deciders.has(shape.id)) ctx.deciders.set(shape.id, new ProductionDecider(ctx.file, arms));
  return ctx.deciders.get(shape.id)!;
}

function comboKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

/** The parts whose act settle re-reads: every asked part under `agree`, the answering (last asked) one under `fallback`. */
function actingParts(kind: string, arms: readonly Arm[], rows: readonly QualityRow[], asked: readonly boolean[]): ActingPart[] {
  const parts = arms.map((arm, at) => ({ provider: arm.provider, model: arm.model, confidence: rows[at]?.r1?.confidence ?? null }));
  const askedParts = parts.filter((_, at) => asked[at]);
  return kind === 'agree' ? askedParts : askedParts.slice(-1);
}

/**
 * One offline combo cell for (item, order, repeat). Production shapes run refsure's `createDecide` on replay
 * providers; research shapes run the copied combinator on `prepare`'s parts. Never sends anything.
 */
async function offlineCell(
  ctx: OfflineCtx, shape: ComboShape, item: BenchItem, order: OrderLabel, repeat: string, stored: readonly (QualityRow | undefined)[],
): Promise<ComboRow> {
  const arms = shape.arms.map((id) => armById(ctx.file, id)) as [Arm, Arm];
  const production = isProductionShape(ctx.file, shape, item.site);
  const first = stored.find((row) => row !== undefined);
  const row: ComboRow = {
    combo_key: comboKey([ctx.phase, ctx.set, item.id, item.site, shape.id, order, repeat]), run_id: ctx.runId,
    source_phase: ctx.phase, set: ctx.set, item: item.id, base: item.base, group: first?.group ?? `${ctx.set}:${item.group ?? item.base}`,
    site: item.site, combo: shape.id, kind: shape.kind, label: production ? 'createDecide' : 'bench_combinator',
    shape_class: production ? 'production' : 'research', order, repeat, presented: first?.presented ?? null,
    gold: first?.gold ?? null, alt: first?.alt ?? [], gold_cut: first?.gold_cut ?? null, gold_twin: first?.gold_twin ?? null,
    risk: item.risk, danger_eligible: first?.danger_eligible ?? null, dropped: null, route: null, digest: null,
    parts: arms.map((arm, at) => {
      const s = stored[at];
      return { arm: arm.id, provider: arm.provider, row_key: s?.row_key ?? null, asked: false, status: s?.status ?? null,
        model: s?.model ?? null, family_ok: s?.family_ok ?? null, digest: s?.digest ?? null, r1: s?.r1 ?? null };
    }),
    verdict: null, correct: null, dangerous: null, settle: null, ms_offline_approx: null, usd: null, usd_priced: null,
    arms_sha: ctx.file.sha, ...ctx.commits, node: process.version,
  };
  const rows = stored.filter((s): s is QualityRow => s !== undefined);
  if (rows.length !== 2) return { ...row, dropped: 'missing_part' };
  // X4 is the one expected refusal of `prepare`; every other failure (a mismatched endpoint, a config error) is a defect.
  if (arms.some((arm) => arm.data === 'public' && holdsPrivateTerm(ctx.file, itemText(item)))) return { ...row, dropped: 'x4' };
  const prepared: Prepared[] = arms.map((arm) => prepare(runtimeFor(ctx, arm), item, order));
  const digest = prepared[0]!.digest;
  row.digest = digest;
  if (prepared.some((p) => p.digest !== digest) || rows.some((s) => s.digest !== digest)) return { ...row, dropped: 'digest' };
  const question = prepared[0]!.built.site.question;
  const answers = rows.map((s) => replayAnswer(s, question));
  let verdict: Verdict<unknown>;
  let asked: AskedLog[] = [];
  const refusal = prepared[0]!.refusal;
  if (production) {
    const decided = await deciderFor(ctx, shape, arms).decide(item, order, { jev: answers[0]!, openai: answers[1]! });
    verdict = decided.verdict;
    asked = decided.asked;
    row.route = decided.route;
    if (refusal === null && decided.route !== shape.kind) return { ...row, dropped: 'route' };
    if (asked.some((a) => a.digest !== digest)) return { ...row, dropped: 'digest' };
  } else if (refusal !== null) {
    // As decide.ts buildParts: an egress refusal of a part stops the Decision before anything is asked.
    verdict = abstainVerdict(refusal.cause as never, refusal.detail);
  } else {
    const parts = prepared.map((p, at) => ({
      ...p.part!,
      provider: replayProvider(arms[at]!.provider, arms[at]!.model, runtimeFor(ctx, arms[at]!).endpoint.host, { [arms[at]!.provider]: answers[at]! }, asked),
    })) as [ComboPart<unknown>, ComboPart<unknown>];
    verdict = (await combineParts(shape.kind, parts)).verdict;
  }
  return finishCell(row, shape, arms, item, rows, answers, asked, verdict);
}

function finishCell(
  row: ComboRow, shape: ComboShape, arms: readonly [Arm, Arm], item: BenchItem, rows: readonly QualityRow[],
  answers: readonly ProviderAnswer[], asked: readonly AskedLog[], verdict: Verdict<unknown>,
): ComboRow {
  const askedProviders = new Set(asked.map((a) => a.provider));
  const wasAsked = arms.map((arm) => askedProviders.has(arm.provider));
  row.parts.forEach((part, at) => { part.asked = wasAsked[at]!; });
  // 2.2: a `family_ok` false row is excluded from every reading; a part that was not asked does not count.
  if (rows.some((s, at) => wasAsked[at] && s.family_ok === false)) return { ...row, dropped: 'family' };
  const gold = row.gold ?? item.gold;
  const scored = score(item.site, verdict, gold, row.alt);
  const r1 = r1Of(verdict);
  row.verdict = r1;
  row.correct = scored.acted && scored.correct;
  row.dangerous = scored.dangerous;
  row.settle = settleReplay(item, item.site, {
    r1, acted: scored.acted, correct: row.correct, dangerous: scored.dangerous, wordingHash: rows[0]!.wording_hash,
    acting: scored.acted ? actingParts(shape.kind, arms, rows, wasAsked) : [], agreed: shape.kind === 'agree',
  });
  const ms = answers.map((a, at) => (wasAsked[at] ? a.ms : null)).filter((m): m is number => m !== null);
  // Offline time is an approximation (2.4): agree = max of the parts, fallback = their sum when B was asked.
  row.ms_offline_approx = ms.length === 0 ? null : shape.kind === 'agree' ? Math.max(...ms) : ms.reduce((s, m) => s + m, 0);
  const askedRows = rows.filter((_, at) => wasAsked[at]);
  row.usd = askedRows.length === 0 ? null : sumOrNull(askedRows.map((s) => s.usd));
  row.usd_priced = askedRows.length === 0 ? null : sumOrNull(askedRows.map((s) => s.usd_priced));
  return row;
}

function shapeDir(shape: ComboShape): string {
  return `${shape.kind}-${shape.arms[0]}-${shape.arms[1]}`;
}

function frozenItems(itemsPath: string): { items: BenchItem[]; setSha: string | null } {
  const freeze = opt(values, 'freeze');
  // Only `live --dry-run` (which sends nothing and writes nothing) may draw from an unfrozen set.
  if (!freeze && !(command === 'live' && dryRun)) fail(`--freeze <table> is required (2.4 reads frozen sets only)\n${USAGE}`);
  const setSha = freeze ? assertFrozen(readFreezeTable(freeze), itemsPath) : null;
  return { items: readItems(itemsPath), setSha };
}

/** One frozen set of a pooled `--items a.jsonl,b.jsonl` list, with its set id (`--set-id` names one per file). */
interface SetItems { set: string; items: BenchItem[] }

function setIdOf(path: string): string {
  return basename(path).replace(/\.jsonl(\.gz)?$/, '');
}

/** The sets of `--items` (comma-separated; 2.4 draws the live sample from the primary sets pooled), each frozen. */
function pooledSets(): SetItems[] {
  const paths = need(values, 'items', USAGE).split(',').filter((p) => p !== '');
  const ids = opt(values, 'set-id')?.split(',') ?? paths.map(setIdOf);
  if (ids.length !== paths.length) fail(`--set-id names ${ids.length} sets for ${paths.length} --items files`);
  if (new Set(ids).size !== ids.length) fail(`--items: set ids repeat (${ids.join(', ')})`);
  return paths.map((path, at) => ({ set: ids[at]!, items: frozenItems(path).items }));
}

/** Stored unit rows of one arm over pooled sets, keyed `set \0 item \0 order \0 repeat` (each set read by its own id). */
function pooledRows(results: string, phase: string, arm: string, sets: readonly string[]): Map<string, QualityRow> {
  const out = new Map<string, QualityRow>();
  for (const set of sets) for (const [key, row] of storedRows(results, phase, arm, set)) out.set(`${set}\0${key}`, row);
  return out;
}

function newRunId(): string {
  return `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z-${randomBytes(3).toString('hex')}`;
}

/** `combos replay`: every shape x item x stored (order, repeat) pair of one set, one ledger file per shape. */
async function replayCommand(): Promise<void> {
  const results = need(values, 'results', USAGE);
  const itemsPath = need(values, 'items', USAGE);
  const out = need(values, 'out', USAGE);
  const phase = opt(values, 'phase') ?? 'P4';
  const set = opt(values, 'set-id') ?? basename(itemsPath).replace(/\.jsonl(\.gz)?$/, '');
  const shapes = (opt(values, 'combos')?.split(/[\s;]+/).filter((s) => s !== '') ?? Q2_SHAPES).map(parseShape);
  const file = readArmsFile();
  for (const shape of shapes) {
    // 2.4 combos pair one Jev arm with one OpenAI arm; the asked log and the replay answers are keyed by provider.
    const providers = shape.arms.map((id) => armById(file, id).provider).sort().join(',');
    if (providers !== 'jev,openai') fail(`${shape.id}: a combo pairs one jev arm and one openai arm (got ${providers})`);
  }
  const orders = new Set((opt(values, 'orders') ?? [...CANDIDATE_ORDERS, 'fixed'].join(',')).split(','));
  const limit = num(values, 'limit', Infinity, USAGE, { min: 1, integer: true });
  const commits = assertPinnedSource();
  const { items } = frozenItems(itemsPath);
  const ctx: OfflineCtx = { file, phase, set, runId: newRunId(), commits, runtimes: new Map(), deciders: new Map() };
  for (const shape of shapes) {
    const stored = shape.arms.map((arm) => storedRows(results, phase, arm, set));
    const path = join(out, phase, 'combos', shapeDir(shape), `${set}.jsonl`);
    mkdirSync(join(out, phase, 'combos', shapeDir(shape)), { recursive: true });
    if (ledgerFiles(join(out, phase), 'combos', shapeDir(shape), set).length > 0) fail(`${path} exists: an offline replay is deterministic, remove it to rebuild`);
    const writer = openLedger(path);
    const tally: Record<string, number> = {};
    for (const item of items.slice(0, limit)) {
      const pairs = new Set<string>();
      for (const map of stored) {
        for (const key of map.keys()) if (key.startsWith(`${item.id}\0`)) pairs.add(key.slice(item.id.length + 1));
      }
      for (const pair of [...pairs].sort()) {
        const [order, repeat] = pair.split('\0') as [OrderLabel, string];
        if (!orders.has(order)) continue;
        const cell = await offlineCell(ctx, shape, item, order, repeat, stored.map((map) => map.get(`${item.id}\0${pair}`)));
        writer.append(cell);
        const label = cell.dropped === null ? `${cell.shape_class}:${cell.verdict?.verdict ?? 'none'}` : `dropped:${cell.dropped}`;
        tally[label] = (tally[label] ?? 0) + 1;
      }
    }
    writer.close();
    process.stdout.write(`${JSON.stringify({ run_id: ctx.runId, combo: shape.id, set, out: path, ...tally })}\n`);
  }
}

/** 2.4 live-check sizes per production combo: items, and the floor of the branch-exercising stratum. */
const LIVE_SIZES: Readonly<Partial<Record<SiteId, { n: number; min: number }>>> = {
  'page-state': { n: 70, min: 30 },
  dismiss: { n: 60, min: 20 },
  presence: { n: 60, min: 20 },
};

/** The two R1 reads differ: one acts and the other does not, or both act on different answers. */
function readsDiffer(a: R1Read | null, b: R1Read | null): boolean {
  if (a === null || b === null) return true;
  if (a.verdict !== b.verdict) return true;
  return a.verdict === 'answer' && JSON.stringify(a.value) !== JSON.stringify(b.value);
}

/** Jev abstained at P4 attempt 1: attempt 1 failed, or it answered under the row (R1 abstain on attempt 1). */
function jevAbstainedAt1(row: QualityRow): boolean {
  return row.attempts[0]?.status !== 'ok' || row.r1?.verdict === 'abstain';
}

/**
 * The 2.4 live sample: from items with both P4 unit rows, the branch stratum (page-state: Jev abstained at attempt 1,
 * so OpenAI is asked; agree sites: `jev_gw` and `oa_primary` reads differ) gives min(min, its size) items, then
 * the rest of the pool fills to `n`; each draw seeded by the bench seed and the site.
 */
function liveSample(
  site: SiteId, sets: readonly SetItems[], jev: Map<string, QualityRow>, openai: Map<string, QualityRow>, n: number, min: number,
): { item: BenchItem; set: string; stratum: 'branch' | 'rest' }[] {
  const keyOf = (e: { item: BenchItem; set: string }): string => `${e.set}\0${e.item.id}\0${unitOrder(e.item)}\0r1`;
  const pool = sets.flatMap(({ set, items }) => items.map((item) => ({ item, set })))
    .filter((e) => e.item.site === site && jev.has(keyOf(e)) && openai.has(keyOf(e)));
  const isBranch = (e: { item: BenchItem; set: string }): boolean =>
    (site === 'page-state' ? jevAbstainedAt1(jev.get(keyOf(e))!) : readsDiffer(jev.get(keyOf(e))!.r1, openai.get(keyOf(e))!.r1));
  const branch = shuffleInPlace(pool.filter(isBranch), seeded(`${BENCH_SEED}:live:${site}:branch`));
  const picked = branch.slice(0, Math.min(min, branch.length));
  const chosen = new Set(picked.map(keyOf));
  const rest = shuffleInPlace(pool.filter((e) => !chosen.has(keyOf(e))), seeded(`${BENCH_SEED}:live:${site}:fill`));
  const all = [...picked, ...rest.slice(0, Math.max(0, n - picked.length))];
  const branchKeys = new Set(branch.map(keyOf));
  return all.map((e) => ({ ...e, stratum: branchKeys.has(keyOf(e)) ? 'branch' : 'rest' }));
}

/** One recorded live part: what its provider returned and what the wire saw. */
interface LivePart { provider: ProviderId; arm: string; answer: ProviderAnswer; wires: WireRecord[] }

/** One P5b row: the live verdict, and both gates' offline verdicts for the same item. */
export interface LiveRow {
  live_key: string; run_id: string; site: string; set: string; item: string; group: string; stratum: string;
  combo: string; order: string; repeat: string; ts_start: string; ms_decision: number; route: string | null;
  parts: LivePart[]; live: R1Read;
  replay: R1Read | null; replay_equal: boolean | null;
  separate: R1Read | null; separate_equal: boolean | null; explained: boolean | null; explanation: string | null;
  gold: string | null; alt: string[]; arms_sha: string; refsure_commit: string; bench_commit: string; node: string;
}

/** Replay gate equality (2.4): answer or abstain cause, index, value, confidence and threshold. */
function sameRead(a: R1Read | null, b: R1Read | null): boolean {
  return JSON.stringify(a && [a.verdict, a.cause, a.index, a.value, a.confidence, a.threshold])
    === JSON.stringify(b && [b.verdict, b.cause, b.index, b.value, b.confidence, b.threshold]);
}

/**
 * Separate-rows equality: the same verdict (answer value, or abstain cause). Scores of separately asked rows differ
 * by sampling, so the combo's reported confidence is compared only by the replay gate.
 */
function sameVerdict(a: R1Read | null, b: R1Read | null): boolean {
  return JSON.stringify(a && [a.verdict, a.cause, a.verdict === 'answer' ? a.value : null])
    === JSON.stringify(b && [b.verdict, b.cause, b.verdict === 'answer' ? b.value : null]);
}

interface GateDeps {
  ctx: OfflineCtx; arms: readonly [Arm, Arm]; replay: ProductionDecider;
  jevRows: Map<string, QualityRow>; openaiRows: Map<string, QualityRow>;
}

/** How one live part's answer reads at its own threshold, exactly as decide.ts buildParts reads a part. */
async function livePartRead(deps: GateDeps, item: BenchItem, order: OrderLabel, arm: Arm, answer: ProviderAnswer): Promise<R1Read | null> {
  const p = prepare(runtimeFor(deps.ctx, arm), item, order);
  if (p.part === null) return null;
  const log: AskedLog[] = [];
  const part = { ...p.part, provider: replayProvider(arm.provider, arm.model, p.part.provider.host, { [arm.provider]: answer }, log) };
  return r1Of((await askOne(part, { deadlineMs: BOUNDS.DEADLINE_MS, signal: new AbortController().signal })).verdict);
}

/** Fills both gates of one live row from its recorded parts and the separately recorded P4 unit rows. */
async function gateRow(deps: GateDeps, row: LiveRow, item: BenchItem): Promise<void> {
  const order = row.order as OrderLabel;
  const recorded = Object.fromEntries(row.parts.map((part) => [part.provider, part.answer])) as Partial<Record<ProviderId, ProviderAnswer>>;
  row.replay = r1Of((await deps.replay.decide(item, order, recorded)).verdict);
  row.replay_equal = sameRead(row.live, row.replay);
  const key = `${row.set}\0${item.id}\0${order}\0r1`;
  const stored = [deps.jevRows.get(key), deps.openaiRows.get(key)];
  if (!stored[0] || !stored[1]) {
    Object.assign(row, { separate: null, separate_equal: null, explained: null, explanation: 'no P4 unit rows for both parts' });
    return;
  }
  const question = SITES[item.site].question;
  const decided = await deps.replay.decide(item, order, { jev: replayAnswer(stored[0], question), openai: replayAnswer(stored[1], question) });
  row.separate = r1Of(decided.verdict);
  row.separate_equal = sameVerdict(row.live, row.separate);
  if (row.separate_equal) return;
  const reasons: string[] = [];
  for (const part of row.parts) {
    const at = deps.arms.findIndex((arm) => arm.provider === part.provider);
    const live = await livePartRead(deps, item, order, deps.arms[at]!, part.answer);
    const p4 = stored[at]!.r1;
    if (readsDiffer(live, p4) || live?.cause !== p4?.cause) {
      reasons.push(`${deps.arms[at]!.id}: live ${live?.verdict ?? 'none'} ${live?.cause ?? JSON.stringify(live?.value)} at ${live?.confidence}, P4 ${p4?.verdict ?? 'none'} ${p4?.cause ?? JSON.stringify(p4?.value)} at ${p4?.confidence}`);
    }
  }
  row.explained = reasons.length > 0;
  row.explanation = reasons.length > 0 ? reasons.join('; ') : 'every asked part read the same: unexplained (bench defect)';
}

/** The production shape a site ships, over the two named arms; refuses a site with no combo. */
function productionShapeOf(file: ArmsFile, site: SiteId, jevArm: string, openaiArm: string): ComboShape {
  const kind = SITES[site].policy.combos?.[0];
  if (kind === undefined) fail(`${site} ships no combo`);
  const shape = parseShape(`${kind}:${jevArm},${openaiArm}`);
  if (!isProductionShape(file, shape, site)) fail(`${shape.id} is not ${site}'s production shape (Jev first, OpenAI at o_primary, one config)`);
  return shape;
}

/** Real providers for the live check, each call taking a rate token and recorded with its wire (headers per arm). */
function liveProviders(file: ArmsFile, arms: readonly [Arm, Arm], buckets: RateBucket[], recorded: LivePart[]) {
  return (config: Parameters<typeof makeProviders>[0], _hosts: Record<ProviderId, string>, log: AskedLog[]) => {
    const made = makeProviders(config, keySet(config, process.env));
    const wrap = (arm: Arm): DecisionProvider => {
      const real = made[arm.provider];
      if (!real) fail(`${arm.id}: refsure built no ${arm.provider} provider for the combo config`);
      if (real.model !== arm.model) fail(`${arm.id}: the combo config sends ${real.model}, the arm names ${arm.model}`);
      return {
        id: real.id, model: real.model, host: real.host, body: (req, opts) => real.body(req, opts),
        ask: async (req, opts) => {
          log.push({ provider: arm.provider, digest: req.digest });
          for (const bucket of buckets) await bucket.take();
          const { result, wires } = await tapped({ extraHeaders: arm.extraHeaders, recordHeaders: file.recordHeaders }, () => real.ask(req, opts));
          const detail = scrubDetail(result.detail);
          recorded.push({ provider: arm.provider, arm: arm.id, answer: { ...result, ...(detail === null ? {} : { detail }) }, wires });
          return result;
        },
      };
    };
    return { jev: wrap(arms[0]), openai: wrap(arms[1]) };
  };
}

/** The two 2.4 gates over a site's live rows. */
function gateSummary(rows: readonly LiveRow[]) {
  const replayMismatch = rows.filter((row) => row.replay_equal !== true).map((row) => row.item);
  const compared = rows.filter((row) => row.separate_equal !== null);
  const equal = compared.filter((row) => row.separate_equal === true).length;
  const unexplained = compared.filter((row) => row.separate_equal === false && row.explained !== true).map((row) => row.item);
  const share = compared.length === 0 ? null : equal / compared.length;
  return {
    items: rows.length,
    replay_gate: replayMismatch.length === 0 ? 'pass' : 'fail: bench defect, every combo reading inconclusive until fixed',
    replay_mismatches: replayMismatch,
    separate_rows: { compared: compared.length, equal, share, unexplained,
      gate: unexplained.length > 0 ? 'fail: unexplained mismatch (bench defect)'
        : share !== null && share >= 0.9 ? 'pass' : 'below 0.90: offline combo readings are approximations; live items carry the verdict at E95 at most' },
  };
}

/** Shared setup of `live` and `gates`: the site's production shape, its P4 unit rows and a replay decider. */
function gateSetup(file: ArmsFile, site: SiteId, sets: readonly string[], results: string, phase: string, commits: OfflineCtx['commits']) {
  const shape = productionShapeOf(file, site, opt(values, 'jev-arm') ?? 'jev_gw', opt(values, 'openai-arm') ?? 'oa_primary');
  const arms = shape.arms.map((id) => armById(file, id)) as [Arm, Arm];
  const ctx: OfflineCtx = { file, phase, set: sets.join('+'), runId: newRunId(), commits, runtimes: new Map(), deciders: new Map() };
  const deps: GateDeps = {
    ctx, arms, replay: new ProductionDecider(file, arms),
    jevRows: pooledRows(results, phase, arms[0].id, sets), openaiRows: pooledRows(results, phase, arms[1].id, sets),
  };
  return { shape, arms, deps };
}

/** `combos live`: P5b, one pass at concurrency 1 through refsure's real `decide()`, then both gates. */
async function liveCommand(): Promise<void> {
  const results = need(values, 'results', USAGE);
  const out = dryRun ? (opt(values, 'out') ?? '') : need(values, 'out', USAGE);
  const site = need(values, 'site', USAGE) as SiteId;
  const sizes = LIVE_SIZES[site] ?? fail(`--site ${site}: one of ${Object.keys(LIVE_SIZES).join(', ')}`);
  const phase = opt(values, 'phase') ?? 'P4';
  const n = num(values, 'n', sizes.n, USAGE, { min: 1, integer: true });
  const min = num(values, 'min', sizes.min, USAGE, { min: 0, integer: true });
  const rpm = num(values, 'rpm', 480, USAGE, { min: 1, integer: true });
  const commits = assertPinnedSource(undefined, undefined, { requireCleanBench: !dryRun });
  const sets = pooledSets();
  const setLabel = sets.map((s) => s.set).join('+');
  const file = readArmsFile();
  const { shape, arms, deps } = gateSetup(file, site, sets.map((s) => s.set), results, phase, commits);
  const sample = liveSample(site, sets, deps.jevRows, deps.openaiRows, n, min);
  const branch = sample.filter((s) => s.stratum === 'branch').length;
  if (dryRun) {
    for (const { item, set, stratum } of sample) process.stdout.write(`${JSON.stringify({ item: item.id, set, site, stratum, order: unitOrder(item) })}\n`);
    process.stderr.write(`dry run: ${shape.id} on ${sample.length} items (${branch} in the branch stratum, floor ${min}); at most ${2 * sample.length} calls; nothing was sent\n`);
    return;
  }
  if (sample.length < n || branch < min) {
    const short = `the pooled sets give ${sample.length} of ${n} items, ${branch} of the branch floor ${min} (2.4)`;
    if (!allowShortBranch) fail(`${short}: add primary sets to --items, or pass --allow-short-branch to run short`);
    process.stderr.write(`warning: ${short}; running short under --allow-short-branch\n`);
  }
  const path = join(out, 'P5b', 'live', `${setLabel}.${site}.jsonl`);
  mkdirSync(join(out, 'P5b', 'live'), { recursive: true });
  if (existsSync(path)) fail(`${path} exists: the live check is one pass`);
  installWireTap();
  const recorded: LivePart[] = [];
  const buckets = [...new Set(arms.map((arm) => (arm.via === 'gateway' ? 'gateway' : `direct-${arm.id}`)))].map((name) => new RateBucket(out, name, rpm));
  const live = new ProductionDecider(file, arms, liveProviders(file, arms, buckets, recorded));
  const writer = openLedger(path);
  const rows: LiveRow[] = [];
  let calls = 0;
  for (const { item, set, stratum } of sample) {
    if (stopReason(out) !== null || calls >= 2 * sample.length) break;
    recorded.length = 0;
    const order = unitOrder(item);
    const tsStart = new Date().toISOString();
    const t0 = performance.now();
    const decided = await live.decide(item, order);
    const ms = Math.round(performance.now() - t0);
    calls += recorded.length;
    const first = deps.jevRows.get(`${set}\0${item.id}\0${order}\0r1`);
    const row: LiveRow = {
      live_key: createHash('sha256').update(['P5b', set, item.id, site, shape.id, order, 'r1'].join('\0')).digest('hex'),
      run_id: deps.ctx.runId, site, set, item: item.id, group: first?.group ?? `${set}:${item.group ?? item.base}`, stratum,
      combo: shape.id, order, repeat: 'r1', ts_start: tsStart, ms_decision: ms, route: decided.route, parts: [...recorded],
      live: r1Of(decided.verdict), replay: null, replay_equal: null, separate: null, separate_equal: null, explained: null,
      explanation: null, gold: first?.gold ?? item.gold, alt: first?.alt ?? item.alt, arms_sha: file.sha, ...commits, node: process.version,
    };
    await gateRow(deps, row, item);
    writer.append(row);
    rows.push(row);
  }
  writer.close();
  process.stdout.write(`${JSON.stringify({ run_id: deps.ctx.runId, combo: shape.id, site, set: setLabel, out: path, calls, stopped: stopReason(out), ...gateSummary(rows) })}\n`);
}

/** `combos gates`: recomputes both gates from a live ledger and the P4 rows, with no call. */
async function gatesCommand(): Promise<void> {
  const livePath = need(values, 'live', USAGE);
  const results = need(values, 'results', USAGE);
  const phase = opt(values, 'phase') ?? 'P4';
  const commits = assertPinnedSource();
  const sets = pooledSets();
  const items = new Map(sets.flatMap(({ set, items: list }) => list.map((item) => [`${set}\0${item.id}`, item] as const)));
  const file = readArmsFile();
  const rows = readRows<LiveRow>(livePath);
  const bySite = new Map<string, LiveRow[]>();
  for (const row of rows) bySite.set(row.site, [...(bySite.get(row.site) ?? []), row]);
  for (const [site, siteRows] of bySite) {
    const { shape, deps } = gateSetup(file, site as SiteId, sets.map((s) => s.set), results, phase, commits);
    for (const row of siteRows) {
      const item = items.get(`${row.set}\0${row.item}`) ?? fail(`${row.set}/${row.item}: not in --items`);
      await gateRow(deps, row, item);
    }
    process.stdout.write(`${JSON.stringify({ combo: shape.id, site, sets: sets.map((x) => x.set), live: livePath, recomputed: true, ...gateSummary(siteRows) })}\n`);
  }
}

/** `combos golden`: the P0 combinator source-diff check (2.4); `--write` records the golden once. */
function goldenCommand(): void {
  if (write) {
    try {
      process.stderr.write(`wrote ${writeGoldenDiff()}\n`);
    } catch (error) {
      fail((error as Error).message);
    }
  }
  const failures = combinatorAsserts();
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stdout.write(`${JSON.stringify({ check: 'combinator source diff', pass: failures.length === 0, failures: failures.length })}\n`);
  if (failures.length > 0) process.exit(1);
}

if (dryRun && command !== 'live') fail(`--dry-run applies to combos live only\n${USAGE}`);

switch (command) {
  case 'golden': goldenCommand(); break;
  case 'replay': await replayCommand(); break;
  case 'live': await liveCommand(); break;
  case 'gates': await gatesCommand(); break;
  default: fail(USAGE);
}
