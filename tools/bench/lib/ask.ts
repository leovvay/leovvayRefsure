import { mkdtempSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { keySet } from '../../../src/config';
import type { RefsureConfig } from '../../../src/config';
import { approve, canonicalJson, isEgressRefusal, sha256Hex, withGrant, writeConsent } from '../../../src/egress';
import type { ApprovedRequest } from '../../../src/egress';
import { askOne, makeProviders } from '../../../src/providers';
import type { ComboPart, DecisionProvider, Endpoint, PartOutcome } from '../../../src/providers';
import { familyOf, KNOWN_FAMILIES, snapshotChanged, validateAnswers } from '../../../src/questions';
import type { DecisionAnswer, PresentedCandidates, SiteRequest, Threshold, Verdict } from '../../../src/questions';
import { sentTwins, stopSentTwin } from '../../../src/questions/sent-twins';
import { armConfig, armEndpoint, holdsPrivateTerm } from './arms';
import type { Arm, ArmsFile } from './arms';
import { buildFor, dangerEligible, goldChecks, groupOf, isCandidateSite, itemText, saltOf, score } from './items';
import type { BenchItem, Built, GoldChecks, OrderLabel } from './items';
import { rowKey } from './ledger';
import type { AttemptRecord, QualityRow, R1Read } from './ledger';
import { rowThreshold, routeOf } from './thresholds';
import type { RowThreshold } from './thresholds';
import { installWireTap, tapped } from './wire-tap';
import { priceUsage } from './guards';

/*
  One row through refsure's own modules (2.1): site.build (items.ts) -> optional ablation edit -> approve (egress:
  redaction, PII masks, byte bounds; consent granted in the bench's own state dir; no origin, profile or caps, as
  tools/calibrate's jev-asker) -> refsure's `askOne` on a part whose read is `stopSentTwin(site.read(...),
  sentTwins(...))`, exactly as decide.ts buildParts builds it; askOne calls `provider.ask(approved, {deadlineMs,
  rendering, signal})`, whose wire validates the answers all-or-nothing (Jev: `validateAnswers`). Nothing here
  builds, renames or reorders a request field.
*/

/** One arm ready to ask: its refsure provider (key read from env at ask time) behind a consent grant the bench wrote. */
export interface ArmRuntime {
  file: ArmsFile;
  arm: Arm;
  endpoint: Endpoint;
  provider: DecisionProvider;
  stateDir: string;
  config(piiMasks: boolean): RefsureConfig;
}

/** Builds the runtime for `arm`; `stateDir` (default: a fresh temp dir) receives the bench's consent grant. */
export function armRuntime(file: ArmsFile, arm: Arm, stateDir?: string): ArmRuntime {
  const dir = stateDir ?? mkdtempSync(join(tmpdir(), 'refsure-bench-'));
  const endpoint = armEndpoint(file, arm);
  const base = armConfig(file, arm, dir, true);
  writeConsent(base.paths.consent, withGrant(null, arm.provider, endpoint.host, new Date()));
  const provider = makeProviders(base, keySet(base, process.env))[arm.provider];
  if (!provider) throw new Error(`${arm.id}: refsure built no ${arm.provider} provider for this config`);
  installWireTap();
  return { file, arm, endpoint, provider, stateDir: dir, config: (piiMasks) => (piiMasks ? base : { ...base, piiMasks }) };
}

/** An ablation edit (2.5): applied to the built request before `approve`; `read` replaces the site read (variant K). */
export interface Ablation {
  variant: string;
  edit(request: SiteRequest, item: BenchItem): SiteRequest;
  read?(answer: DecisionAnswer, threshold: Threshold): Verdict<unknown>;
}

/** A request built and approved for one arm, with the part refsure would ask; or the egress refusal. */
export interface Prepared {
  built: Built;
  approved: ApprovedRequest | null;
  refusal: { cause: string; detail: string } | null;
  threshold: RowThreshold;
  part: ComboPart<unknown> | null;
  /** Caller index per presented key (candidate sites), in key order. */
  presented: Record<string, number | null> | null;
  digest: string | null;
  qdigest: string | null;
  /** The exact wire body (`provider.body`), never holding a key. */
  body: unknown;
  wireSha: string | null;
  reqBytes: number | null;
}

/** X4: throws before anything is built when a `public` arm would receive an item holding a private term. */
export function assertX4(rt: ArmRuntime, item: BenchItem): void {
  if (rt.arm.data === 'public' && holdsPrivateTerm(rt.file, itemText(item))) {
    throw new Error(`${rt.arm.id}: item ${item.id} holds a private term and is never sent to a public arm (X4)`);
  }
}

/** Builds, edits, approves and wires one (item, order) for one arm. No network. Throws on an X4 item. */
export function prepare(rt: ArmRuntime, item: BenchItem, order: OrderLabel, ablation?: Ablation): Prepared {
  assertX4(rt, item);
  const built = buildFor(item, order);
  const request = ablation ? ablation.edit(built.request, item) : built.request;
  const threshold = rowThreshold(item.site, rt.arm.provider, item.risk, rt.arm.model, built.wordingHash);
  const approvedOrRefusal = approve(request, {
    site: item.site, provider: rt.arm.provider, host: rt.endpoint.host, originUrl: null, profileId: null,
    config: rt.config(item.masks ?? true), dryRun: false, nowMs: Date.now(), egressLog: [],
  });
  let presented: Record<string, number | null> | null = null;
  if (isCandidateSite(item.site)) {
    const context = built.context as PresentedCandidates;
    presented = {};
    for (const key of Object.keys(context.criteria)) presented[key] = context.indexOf(key);
  }
  const empty = { built, threshold, presented, part: null, body: null, wireSha: null, reqBytes: null };
  if (isEgressRefusal(approvedOrRefusal)) {
    if (approvedOrRefusal.cause === 'not_set_up') throw new Error(`${rt.arm.id}: ${approvedOrRefusal.detail}`);
    return { ...empty, approved: null, refusal: approvedOrRefusal, digest: null, qdigest: null };
  }
  const approved = approvedOrRefusal;
  const twins = sentTwins(approved, built.site.question);
  const read = ablation?.read
    ?? ((answer, bound: Threshold) => stopSentTwin(built.site.read(answer, built.context, bound), twins));
  const rendering = rt.arm.rendering === 'none' ? undefined : rt.arm.rendering;
  const part: ComboPart<unknown> = {
    provider: rt.provider, request: approved, question: built.site.question, threshold: threshold.threshold, read,
    ...(rendering === undefined ? {} : { rendering }),
  };
  const body = rt.provider.body(approved, rendering === undefined ? {} : { rendering });
  const wire = JSON.stringify(body);
  return {
    built, approved, refusal: null, threshold, part, presented, body,
    digest: approved.digest,
    qdigest: sha256Hex(canonicalJson(approved.questions)),
    wireSha: sha256Hex(wire),
    reqBytes: Buffer.byteLength(wire, 'utf8'),
  };
}

const RETRYABLE = /^(timeout|transport|http_429|http_5\d\d)$/;

/** Options of one row; `beforeAttempt` is where a runner takes a rate-bucket token (guards.ts). */
export interface AskRowOptions {
  phase: string;
  slice: 'interim' | 'final';
  set: string;
  setSha: string;
  order: OrderLabel;
  repeat: string;
  variant?: string;
  ablation?: Ablation;
  deadlineMs: number;
  maxAttempts: number;
  runId: string;
  concurrency: number;
  commits: { refsure_commit: string; bench_commit: string };
  gold?: GoldChecks;
  /** The row's flags; a function is read once, after the first `beforeAttempt` resolves (at send time). */
  flags?: readonly string[] | (() => readonly string[]);
  beforeAttempt?(): Promise<void>;
  settle?(item: BenchItem, row: QualityRow): unknown;
}

export function r1Of(verdict: Verdict<unknown>): R1Read {
  return verdict.kind === 'answer'
    ? { verdict: 'answer', value: verdict.value, index: verdict.index, cause: null, confidence: verdict.confidence, threshold: verdict.threshold }
    : { verdict: 'abstain', value: null, index: verdict.leaned, cause: verdict.cause, confidence: verdict.confidence, threshold: verdict.threshold };
}

/** A failure detail with anything key-shaped removed, at most 400 chars. */
export function scrubDetail(detail: string | undefined): string | null {
  if (detail === undefined) return null;
  return detail.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[key]').replace(/Bearer\s+\S+/gi, 'Bearer [key]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[long]').slice(0, 400);
}

/**
 * Asks one row: up to `maxAttempts` outer attempts on timeout|transport|http_429|http_5xx (sleep 1 s x attempt^2,
 * as calibrate's run.ts), every attempt logged with its `T_wire`, `T_ask`, HTTP status, raw usage and recorded
 * headers. R1 reads the first answered attempt. Returns the full 7.4 row; never throws for a provider failure.
 */
export async function askRow(rt: ArmRuntime, item: BenchItem, opts: AskRowOptions): Promise<QualityRow> {
  assertX4(rt, item);
  const variant = opts.variant ?? opts.ablation?.variant ?? 'shipped';
  const gold = opts.gold ?? goldChecks(item);
  const prepared = prepare(rt, item, opts.order, opts.ablation);
  const sendLoad = loadavg()[0] ?? 0;
  const attempts: AttemptRecord[] = [];
  const started = performance.now();
  let tsStart: string | null = null;
  let answered: PartOutcome<unknown> | null = null;
  let last: PartOutcome<unknown> | null = null;
  let answeredWires: { resp_bytes: number | null; usage: unknown[] } | null = null;
  const flagsNow = () => (typeof opts.flags === 'function' ? opts.flags() : (opts.flags ?? []));
  let sentFlags: readonly string[] | null = null;
  if (prepared.part !== null) {
    const part = prepared.part;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt += 1) {
      await opts.beforeAttempt?.();
      sentFlags ??= flagsNow();
      tsStart ??= new Date().toISOString();
      const t0 = performance.now();
      let tAsk = 0;
      const { result, wires } = await tapped({ extraHeaders: rt.arm.extraHeaders, recordHeaders: rt.file.recordHeaders }, async () => {
        const outcome = await askOne(part, { deadlineMs: opts.deadlineMs, signal: AbortSignal.timeout(opts.deadlineMs + 1000) });
        tAsk = performance.now() - t0;
        return outcome;
      });
      last = result;
      const status = result.answer.status;
      attempts.push({
        status, provider_ms: result.answer.ms, t_wire: wires.map((w) => Math.round(w.t_wire * 10) / 10),
        t_ask: Math.round(tAsk * 10) / 10, http_status: wires.map((w) => w.http_status ?? 0),
        usage: wires.map((w) => w.usage), headers: wires.map((w) => w.headers),
        timed_out: status === 'timeout' || wires.some((w) => w.timed_out), spent: wires.some((w) => w.spent),
        resp_bytes: wires.map((w) => w.resp_bytes ?? 0),
      });
      if (status === 'ok') {
        answered = result;
        const okWire = wires.filter((w) => w.http_status !== null && w.http_status < 300).at(-1);
        answeredWires = { resp_bytes: okWire?.resp_bytes ?? null, usage: wires.map((w) => w.usage) };
        break;
      }
      if (!RETRYABLE.test(status) || attempts.at(-1)?.spent === true || attempt >= opts.maxAttempts) break;
      await sleep(1000 * attempt * attempt);
    }
  }
  const outcome = answered ?? last;
  const answer = outcome?.answer ?? null;
  const verdict = outcome?.verdict ?? null;
  const status = prepared.refusal ? `refused:${prepared.refusal.cause}` : (answer?.status ?? 'transport');
  const model = answer?.model ?? null;
  const question = prepared.built.site.question;
  const one = answer?.answers?.[question] ?? null;
  const r1 = prepared.refusal
    ? { verdict: 'abstain' as const, value: null, index: null, cause: prepared.refusal.cause, confidence: null, threshold: null }
    : verdict ? r1Of(verdict) : null;
  const scored = verdict ? score(item.site, verdict, gold.gold, gold.alt) : { acted: false, correct: false, dangerous: false };
  const httpLast = attempts.at(-1)?.http_status.at(-1);
  const flags = [...(sentFlags ?? flagsNow()), ...(sendLoad > 12 ? ['high_load'] : [])];
  const usd = answered?.answer.usd ?? null;
  const row: QualityRow = {
    row_key: rowKey({ phase: opts.phase, set: opts.set, item: item.id, site: item.site, arm: rt.arm.id, variant, order: opts.order, repeat: opts.repeat }),
    run_id: opts.runId, phase: opts.phase, slice: opts.slice,
    ts_start: tsStart, ts_end: attempts.length > 0 ? new Date().toISOString() : null,
    set: opts.set, set_sha: opts.setSha, item: item.id, base: item.base, group: groupOf(item, opts.set), origin: item.origin ?? 'native',
    site: item.site, arm: rt.arm.id, provider: rt.arm.provider, route: routeOf(item.site, rt.arm.provider),
    rendering: rt.arm.rendering, variant, order: opts.order, salt: saltOf(opts.order), repeat: opts.repeat, presented: prepared.presented,
    gold: gold.gold, alt: gold.alt, gold_cut: gold.goldCut, gold_twin: gold.goldTwin, risk: item.risk, lang: item.lang,
    condition: item.condition, masks: item.masks ?? true, visual_only: item.visualOnly === true,
    status, cause: r1?.cause ?? null, http_status: httpLast === undefined || httpLast === 0 ? null : httpLast,
    detail: scrubDetail(prepared.refusal?.detail ?? answer?.detail),
    model, family_ok: model === null ? null : familyOf(model) === familyOf(KNOWN_FAMILIES[rt.arm.provider]),
    model_changed: model === null ? null : snapshotChanged(rt.arm.provider, rt.arm.model, model),
    digest: prepared.digest, qdigest: prepared.qdigest, wording_hash: prepared.built.wordingHash,
    req_bytes: prepared.reqBytes, resp_bytes: answeredWires?.resp_bytes ?? null,
    answer: one, strict_valid: answer?.answers && prepared.approved ? validateAnswers(prepared.approved.questions, answer.answers) !== null : null,
    threshold_r1: prepared.threshold.threshold, threshold_source: prepared.threshold.source, r1,
    settle: null,
    correct: verdict ? scored.correct && scored.acted : null, dangerous: verdict ? scored.dangerous : null,
    danger_eligible: dangerEligible(item.site, gold.gold),
    usd, usd_priced: answeredWires ? priceUsage(rt.arm.provider, answeredWires.usage) : null,
    attempts, ms_total: Math.round(performance.now() - started), deadline_ms: opts.deadlineMs, flags,
    concurrency: opts.concurrency, loadavg: Math.round(sendLoad * 100) / 100, host: rt.endpoint.host,
    arms_sha: rt.file.sha, refsure_commit: opts.commits.refsure_commit, bench_commit: opts.commits.bench_commit, node: process.version,
  };
  if (opts.settle) row.settle = opts.settle(item, row) ?? null;
  return row;
}
