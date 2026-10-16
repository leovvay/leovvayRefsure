import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { keySet } from '../../../src/config';
import type { RefsureConfig } from '../../../src/config';
import { canonicalJson, sha256Hex, withGrant, writeConsent } from '../../../src/egress';
import { DryRunStop, newTrace } from '../../../src/output';
import { makeProviders } from '../../../src/providers';
import type { DecisionProvider, ProviderAnswer, Rendering } from '../../../src/providers';
import { createDecide, familyOf, KNOWN_FAMILIES, SITES, snapshotChanged } from '../../../src/questions';
import type { DecideFn, ProviderId, SiteId, Verdict } from '../../../src/questions';
import { armConfig, armEndpoint } from '../lib/arms';
import { priceUsage } from '../lib/guards';
import type { Arm, ArmsFile } from '../lib/arms';
import { isCandidateSite } from '../lib/items';
import type { BenchItem } from '../lib/items';
import { riskOf } from '../lib/thresholds';
import { installWireTap, tapped } from '../lib/wire-tap';
import type { WireRecord } from '../lib/wire-tap';

/*
  4.3 M2: production routes through refsure's real `decide()` (`createDecide` with refsure's own providers and a
  bench config whose providers match the route). `T_decision` runs from the call to the returned verdict: route
  plan, build, approve (egress log read and write), every part, read, maturity. Beside it, under their own names:
  `T_ask_plan` = refsure's `decision.ms` (askPlan only) and `T_part` = `decision.parts[].ms`. The only bench hook
  is a wrapper around each provider's `ask` that opens a wire-tap scope with the matching gateway arm's spend-tag
  headers and keeps the provider's answer: nothing in the request or the reading changes.
*/

export type Combo = 'jev' | 'openai' | 'agree' | 'fallback';
export interface Route { site: SiteId; combo: Combo }

/** The 12 production routes of 4.3 M2. */
export const M2_ROUTES: readonly Route[] = [
  ...(['locate', 'find', 'dismiss', 'page-state', 'outcome', 'presence', 'option-map'] as const).map((site) => ({ site, combo: 'jev' as const })),
  { site: 'presence', combo: 'openai' }, { site: 'page-state', combo: 'openai' },
  { site: 'dismiss', combo: 'agree' }, { site: 'presence', combo: 'agree' },
  { site: 'page-state', combo: 'fallback' },
];

export function routesFor(site: SiteId): Route[] {
  return M2_ROUTES.filter((route) => route.site === site);
}

/** The ledger `arm` of an M2 row (one ledger directory per combo; the site tells the 12 routes apart). */
export function m2Arm(combo: Combo): string {
  return `m2_${combo}`;
}

/** 4.3: the M2 (and P5b) caps; refsure's defaults would refuse the run. */
export const M2_LIMITS = { decisionsPerMinute: 600, usdPerDay: 20 } as const;
export const FIXTURE_LINES = 2000;
const HOUR_MS = 3_600_000;

/** The gateway arm whose spend tags a part carries: Jev's, or OpenAI's with the part's rendering. */
export function partArm(file: ArmsFile, provider: ProviderId, rendering: Rendering | undefined): Arm {
  const gateway = file.arms.filter((arm) => arm.via === 'gateway' && arm.provider === provider);
  const match = provider === 'openai' ? gateway.find((arm) => arm.rendering === rendering) : gateway[0];
  const arm = match ?? gateway[0];
  if (!arm) throw new Error(`M2 needs a gateway ${provider} arm in the arms file`);
  return arm;
}

/** The M2 config: the gateway arms' one key slot (refsure has one), the gateway block, M2 limits, paths in `stateDir`. */
export function m2Config(file: ArmsFile, stateDir: string, piiMasks: boolean): RefsureConfig {
  const gateway = file.arms.filter((arm) => arm.via === 'gateway');
  const envs = new Set(gateway.map((arm) => arm.keyEnv));
  if (envs.size !== 1) throw new Error(`M2 routes every part through the one gateway key slot; the gateway arms name ${envs.size} key env names`);
  const jev = partArm(file, 'jev', undefined);
  for (const arm of gateway) armEndpoint(file, arm);
  return { ...armConfig(file, jev, stateDir, piiMasks), limits: { ...M2_LIMITS } };
}

/**
 * The frozen egress-log fixture: 1,000 calls (a reservation line and its settling line each), dated from 25 h
 * before `startMs` backwards, so `approve` parses a day's worth of lines and the limits count none of them. Its
 * sha256 is taken over the lines with times relative to `startMs`, so every repeat's fixture hashes the same.
 */
export function egressFixture(startMs: number): { text: string; sha: string } {
  const lines: string[] = [];
  const relative: string[] = [];
  const sites = Object.keys(SITES);
  for (let call = FIXTURE_LINES / 2 - 1; call >= 0; call -= 1) {
    const offset = -25 * HOUR_MS - call * 40_000;
    const base = {
      command: 'bench-fixture', site: sites[call % sites.length], provider: call % 3 === 0 ? 'openai' : 'jev', host: 'fixture.invalid',
      bytes: 2000 + ((call * 37) % 6000), digest: sha256Hex(`fixture:${call}`), usd: null, model: null, call: `fixture-${call}`,
    };
    for (const status of ['pending', 'ok']) {
      const at = offset + (status === 'ok' ? 400 : 0);
      lines.push(JSON.stringify({ t: startMs + at, ...base, status }));
      relative.push(JSON.stringify({ t: at, ...base, status }));
    }
  }
  return { text: `${lines.join('\n')}\n`, sha: sha256Hex(relative.join('\n')) };
}

/**
 * One provider call as the wrapper saw it: refsure's answer, the wire records, the arm whose tags it carried, and
 * the approved request it sent (7.4: `digest`, `qdigest`, and `req_bytes` of the exact wire body, as M1 rows store).
 */
export interface PartCapture {
  provider: ProviderId; rendering: Rendering | null; arm: string; answer: ProviderAnswer; wires: WireRecord[];
  /** The pinned model refsure's provider requested (for `snapshotChanged`). */
  requested: string;
  digest: string; qdigest: string; req_bytes: number; wire_sha: string;
}

/** One state directory of M2 (fresh before each repeat): consent for both providers, the egress fixture, `decide`. */
export interface M2Runtime {
  stateDir: string;
  fixtureSha: string;
  host: string;
  decideFor(masks: boolean): DecideFn;
  /** Filled by the provider wrappers during one Decision; reset by `decideRow`. */
  captures: PartCapture[];
  trace: ReturnType<typeof newTrace>;
}

function wrapped(file: ArmsFile, base: DecisionProvider, sink: () => PartCapture[]): DecisionProvider {
  return {
    id: base.id, model: base.model, host: base.host,
    body: (req, opts) => base.body(req, opts),
    async ask(req, opts) {
      const arm = partArm(file, base.id, opts.rendering);
      // The body `ask` sends, from the provider's own `body()` (no key; the same bytes M1's `req_bytes` counts).
      const wire = JSON.stringify(base.body(req, opts.rendering === undefined ? {} : { rendering: opts.rendering }));
      const sent = { digest: req.digest, qdigest: sha256Hex(canonicalJson(req.questions)), req_bytes: Buffer.byteLength(wire, 'utf8'), wire_sha: sha256Hex(wire) };
      const { result, wires } = await tapped({ extraHeaders: arm.extraHeaders, recordHeaders: file.recordHeaders }, () => base.ask(req, opts));
      sink().push({ provider: base.id, rendering: opts.rendering ?? null, arm: arm.id, answer: result, wires, requested: base.model, ...sent });
      return result;
    },
  };
}

/** A fresh M2 state directory `stateDir` (it must not exist yet), ready to decide at `startMs`. */
export function m2Runtime(file: ArmsFile, stateDir: string, startMs = Date.now()): M2Runtime {
  mkdirSync(dirname(stateDir), { recursive: true });
  // Not recursive: a state directory that already exists is refused (each repeat starts fresh, 4.3).
  mkdirSync(stateDir, { mode: 0o700 });
  const fixture = egressFixture(startMs);
  const base = m2Config(file, stateDir, true);
  writeFileSync(base.paths.egressLog, fixture.text, { mode: 0o600 });
  const host = armEndpoint(file, partArm(file, 'jev', undefined)).host;
  let consent = null;
  for (const id of ['jev', 'openai'] as const) consent = withGrant(consent, id, armEndpoint(file, partArm(file, id, 'o_primary')).host, new Date());
  writeConsent(base.paths.consent, consent!);
  installWireTap();
  const rt: M2Runtime = { stateDir, fixtureSha: fixture.sha, host, captures: [], trace: newTrace(), decideFor: () => { throw new Error('unset'); } };
  const decides = new Map<boolean, DecideFn>();
  rt.decideFor = (masks) => {
    let decide = decides.get(masks);
    if (!decide) {
      const config = masks ? base : m2Config(file, stateDir, false);
      const keys = keySet(config, process.env);
      const made = makeProviders(config, keys);
      const providers = {
        ...(made.jev ? { jev: wrapped(file, made.jev, () => rt.captures) } : {}),
        ...(made.openai ? { openai: wrapped(file, made.openai, () => rt.captures) } : {}),
      };
      decide = createDecide({ config, keys, providers, trace: rt.trace, command: 'bench', pageProfile: () => null }).decide;
      decides.set(masks, decide);
    }
    return decide;
  };
  return rt;
}

/** Lines in the state dir's egress log now (the fixture plus every call this repeat logged). */
export function egressLines(rt: M2Runtime): number {
  try {
    return readFileSync(join(rt.stateDir, 'egress.log'), 'utf8').split('\n').filter((line) => line !== '').length;
  } catch {
    return 0;
  }
}

/** The site input as a command passes it: candidate sites in production's own order (`p0`, no salt). */
export function decisionInput(item: BenchItem): unknown {
  return isCandidateSite(item.site) ? { ...item.input, order: { kind: 'shuffled' } } : item.input;
}

/** The origin the bench names: allow/deny lists are empty, so `checkOrigin` admits it after reading both. */
export const BENCH_ORIGIN = 'https://example.com/';

const FAIL = /^(timeout|transport|http_\d+)$/;

/** One M2 part in the ledger: refsure's `T_part` beside the wire's view of the same call. */
export interface DecisionPartRow {
  provider: ProviderId; rendering: Rendering | null; arm: string; status: string; model: string | null;
  /** `T_part`: refsure's `decision.parts[].ms` for this part (0 when the part was not sent). */
  t_part: number | null;
  t_wire: number[]; http_status: number[]; usage: unknown[]; headers: Record<string, string>[];
  timed_out: boolean; spent: boolean; usd: number | null; resp_bytes: number[];
  /** 7.4 request fields: approved-request sha256, questions sha256, the wire body's size and sha256. */
  digest: string; qdigest: string; req_bytes: number; wire_sha: string;
  /** 2.2: `familyOf(answering model)` equals the pinned family; `snapshotChanged` (null when no model came back). */
  family_ok: boolean | null; model_changed: boolean | null;
  /** The part's own `usage` priced with the 7.2 table. */
  usd_priced: number | null;
}

/** One M2 Decision row (7.4 timing fields; a Decision has parts, not outer attempts). */
export interface DecisionRow {
  row_key: string; run_id: string; phase: string; slice: 'final'; mode: 'M2';
  ts_start: string; ts_end: string;
  set: string; set_sha: string; item: string; base: string; group: string; origin: 'stored' | 'native';
  site: SiteId; arm: string; route: Combo; variant: 'shipped'; order: 'p0' | 'fixed'; repeat: string; row_index: number;
  gold: string; alt: string[]; risk: string | null;
  /** `answer`, `abstain`, `failure` (a part failed as the route reads it, 4.4) or `spend_limit` (a bench defect: re-run). */
  status: 'answer' | 'abstain' | 'failure' | 'spend_limit';
  cause: string | null; detail: string | null;
  verdict: { kind: string; value: unknown; index: string | null; confidence: number | null; threshold: number | null };
  maturity: string | null;
  t_decision: number; t_ask_plan: number | null; timed_out: boolean;
  parts: DecisionPartRow[];
  /** refsure's wording hash for this Decision (`decision.wording.hash`). */
  wording_hash: string | null;
  /** false when any part answered from another model family (2.2: the row is excluded from every reading). */
  family_ok: boolean | null; model_changed: boolean | null;
  egress_lines: number; fixture_sha: string;
  deadline_ms: number; flags: string[]; concurrency: 1; loadavg: number; host: string;
  arms_sha: string; refsure_commit: string; bench_commit: string; node: string;
}

/** 4.4: a Decision without an answer by failure. Single: its part; `agree`: either part; `fallback`: no part answered and one failed. */
export function decisionFailed(combo: Combo, parts: readonly { status: string }[]): boolean {
  if (parts.length === 0) return false;
  if (combo === 'fallback') return !parts.some((part) => part.status === 'ok') && parts.some((part) => FAIL.test(part.status));
  return parts.some((part) => FAIL.test(part.status));
}

function verdictOf(verdict: Verdict<unknown>): DecisionRow['verdict'] {
  return verdict.kind === 'answer'
    ? { kind: 'answer', value: verdict.value, index: verdict.index, confidence: verdict.confidence, threshold: verdict.threshold }
    : { kind: 'abstain', value: null, index: verdict.leaned, confidence: verdict.confidence, threshold: verdict.threshold };
}

/** What one Decision returned and took; the caller fills the row's identity and run context. */
export interface Decided1 {
  status: DecisionRow['status']; cause: string | null; detail: string | null; verdict: DecisionRow['verdict']; maturity: string | null;
  t_decision: number; t_ask_plan: number | null; timed_out: boolean; parts: DecisionPartRow[]; egress_lines: number;
  wording_hash: string | null; family_ok: boolean | null; model_changed: boolean | null;
  ts_start: string; ts_end: string;
}

/** Runs one Decision through refsure's `decide()` on `route` and reads its times. Never throws for a provider failure. */
export async function runDecision(rt: M2Runtime, item: BenchItem, route: Route): Promise<Decided1> {
  rt.captures = [];
  rt.trace.decisions.length = 0;
  rt.trace.egress.length = 0;
  const decide = rt.decideFor(item.masks ?? true);
  const site = SITES[item.site];
  const risk = riskOf(item.risk);
  const egress_lines = egressLines(rt);
  const ts_start = new Date().toISOString();
  const t0 = performance.now();
  const decided = await decide(site as never, decisionInput(item) as never, {
    combo: route.combo, originUrl: BENCH_ORIGIN, dryRun: false, signal: AbortSignal.timeout(30_000), ...(risk ? { risk } : {}),
  });
  const t_decision = Math.round((performance.now() - t0) * 10) / 10;
  const info = rt.trace.decisions.at(-1) ?? null;
  const parts: DecisionPartRow[] = rt.captures.map((capture) => ({
    provider: capture.provider, rendering: capture.rendering, arm: capture.arm, status: capture.answer.status, model: capture.answer.model,
    t_part: info?.parts.find((part) => part.provider === capture.provider)?.ms ?? null,
    t_wire: capture.wires.map((w) => Math.round(w.t_wire * 10) / 10), http_status: capture.wires.map((w) => w.http_status ?? 0),
    usage: capture.wires.map((w) => w.usage), headers: capture.wires.map((w) => w.headers),
    timed_out: capture.answer.status === 'timeout' || capture.wires.some((w) => w.timed_out), spent: capture.wires.some((w) => w.spent),
    usd: capture.answer.usd, resp_bytes: capture.wires.map((w) => w.resp_bytes ?? 0),
    digest: capture.digest, qdigest: capture.qdigest, req_bytes: capture.req_bytes, wire_sha: capture.wire_sha,
    family_ok: capture.answer.model === null ? null : familyOf(capture.answer.model) === familyOf(KNOWN_FAMILIES[capture.provider]),
    model_changed: capture.answer.model === null ? null : snapshotChanged(capture.provider, capture.requested, capture.answer.model),
    usd_priced: capture.answer.status === 'ok' ? priceUsage(capture.provider, capture.wires.map((w) => w.usage)) : null,
  }));
  const answeredParts = parts.filter((part) => part.family_ok !== null);
  const verdict = decided.verdict;
  const cause = verdict.kind === 'abstain' ? verdict.cause : null;
  const detail = verdict.kind === 'abstain' ? (verdict.detail ?? null) : null;
  const spend = cause === 'spend_limit' || /was not asked: .*(limit|cap)/i.test(detail ?? '');
  const status: DecisionRow['status'] = spend ? 'spend_limit'
    : decisionFailed(route.combo, parts) ? 'failure' : verdict.kind === 'answer' ? 'answer' : 'abstain';
  return {
    status, cause, detail: detail?.slice(0, 400) ?? null, verdict: verdictOf(verdict), maturity: decided.maturity ?? null,
    t_decision, t_ask_plan: info?.ms ?? null, timed_out: parts.some((part) => part.timed_out), parts, egress_lines,
    wording_hash: info?.wording.hash ?? null,
    family_ok: answeredParts.length === 0 ? null : answeredParts.every((part) => part.family_ok === true),
    model_changed: answeredParts.length === 0 ? null : answeredParts.some((part) => part.model_changed === true),
    ts_start, ts_end: new Date().toISOString(),
  };
}

/** A dry Decision: route, build and approve, then refsure's own `DryRunStop` with the exact bodies. Sends nothing. */
export async function dryDecision(rt: M2Runtime, item: BenchItem, route: Route): Promise<{ bodies: { provider: string; sha: string; bytes: number }[] } | { abstain: string }> {
  rt.trace.dryRun.length = 0;
  const risk = riskOf(item.risk);
  try {
    const decided = await rt.decideFor(item.masks ?? true)(SITES[item.site] as never, decisionInput(item) as never, {
      combo: route.combo, originUrl: BENCH_ORIGIN, dryRun: true, signal: AbortSignal.timeout(30_000), ...(risk ? { risk } : {}),
    });
    return { abstain: decided.verdict.kind === 'abstain' ? decided.verdict.cause : 'answered in a dry run' };
  } catch (error) {
    if (!(error instanceof DryRunStop)) throw error;
    return { bodies: rt.trace.dryRun.map((entry) => {
      const wire = JSON.stringify(entry.body);
      return { provider: entry.provider, sha: sha256Hex(wire), bytes: Buffer.byteLength(wire, 'utf8') };
    }) };
  }
}
