import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keySet } from '../../../src/config';
import type { RefsureConfig } from '../../../src/config';
import { withGrant, writeConsent } from '../../../src/egress';
import { newTrace } from '../../../src/output/new-trace';
import { providerRoster } from '../../../src/providers';
import type { ComboOutcome, ComboPart, DecisionProvider, ProviderAnswer, ProviderStatus } from '../../../src/providers';
import { BOUNDS, createDecide, SITES } from '../../../src/questions';
import type { DecisionAnswer, DecideFn, ProviderId, SiteId, Verdict } from '../../../src/questions';
import { armById, armConfig } from './arms';
import type { Arm, ArmsFile } from './arms';
import { askAgree } from './combine-copy/agree';
import { askFallback } from './combine-copy/fallback';
import { PINNED_REFSURE_COMMIT, repoRoot } from './freeze';
import { isCandidateSite, saltOf } from './items';
import type { BenchItem, OrderLabel } from './items';
import type { QualityRow } from './ledger';
import { riskOf } from './thresholds';

/*
  2.4 combos, offline. Production shapes (the combo a site ships, Jev first, OpenAI at `o_primary`) run through
  refsure's own `createDecide` with replay providers that hand back each part's stored answer. Research shapes
  (`bench_combinator`) cannot pass `planRoute`, so they run the copy of refsure's `combine/{agree,fallback,ask-one,
  rank}.ts` kept in `combine-copy/` (imports rewritten, nothing else) on parts built by `ask.ts` `prepare`. The copy's
  line diff against the pinned source is committed as `golden/combinator.diff` and checked in P0.
*/

/** The copied modules, in the order the golden diff lists them. */
export const COPIED = ['agree', 'fallback', 'ask-one', 'rank'] as const;
export const GOLDEN_DIFF = 'tools/bench/golden/combinator.diff';

/** Line-for-line diff of each copy against refsure's source at the pinned commit (a copy keeps every line). */
export function combinatorDiff(root = repoRoot()): string {
  const out: string[] = [];
  for (const name of COPIED) {
    const src = `src/providers/combine/${name}.ts`;
    const copy = `tools/bench/lib/combine-copy/${name}.ts`;
    const a = execFileSync('git', ['-C', root, 'show', `${PINNED_REFSURE_COMMIT}:${src}`], { encoding: 'utf8' }).split('\n');
    const b = readFileSync(join(root, copy), 'utf8').split('\n');
    out.push(`--- a/${src}`, `+++ b/${copy}`);
    if (a.length !== b.length) out.push(`! line count ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) out.push(`@@ ${i + 1}`, `-${a[i] ?? ''}`, `+${b[i] ?? ''}`);
    }
  }
  return `${out.join('\n')}\n`;
}

const IMPORT_LINE = /^[-+]import (type )?\{[^}]*\} from '[^']+';$/;

/** P0 (2.4): one line per failure; empty passes. The diff equals the committed golden and touches imports only. */
export function combinatorAsserts(root = repoRoot()): string[] {
  const failures: string[] = [];
  const diff = combinatorDiff(root);
  const golden = join(root, GOLDEN_DIFF);
  if (!existsSync(golden)) failures.push(`${GOLDEN_DIFF} is missing (write it with combos.ts golden --write)`);
  else if (readFileSync(golden, 'utf8') !== diff) failures.push(`the combinator copy differs from ${GOLDEN_DIFF}`);
  for (const line of diff.split('\n')) {
    if (line.startsWith('!')) failures.push(line);
    if (/^[-+](?![-+]{2} [ab]\/)/.test(line) && !IMPORT_LINE.test(line)) failures.push(`non-import line differs: ${line.slice(0, 120)}`);
  }
  return failures;
}

/** Writes the golden diff from the current copy (P0 setup, once; committed). */
export function writeGoldenDiff(root = repoRoot()): string {
  const path = join(root, GOLDEN_DIFF);
  // Written once: overwriting a committed golden would make the check pass against itself.
  if (existsSync(path)) throw new Error(`${GOLDEN_DIFF} exists: the golden is recorded once; delete it in a reviewed commit to re-record`);
  writeFileSync(path, combinatorDiff(root), { flag: 'wx' });
  return path;
}

export type ComboKind = 'agree' | 'fallback';

/** A combo over two arms, in the order stated (`fallback` asks the first, then the second only when it may). */
export interface ComboShape { id: string; kind: ComboKind; arms: readonly [string, string] }

/** `agree:a,b` or `fallback:a,b` (a first). */
export function parseShape(text: string): ComboShape {
  const match = /^(agree|fallback):([\w.-]+),([\w.-]+)$/.exec(text.trim());
  if (!match) throw new Error(`combo ${JSON.stringify(text)}: expected agree:<arm>,<arm> or fallback:<arm>,<arm>`);
  const kind = match[1] as ComboKind;
  const a = match[2]!;
  const b = match[3]!;
  return { id: kind === 'agree' ? `agree(${a},${b})` : `fallback(${a}->${b})`, kind, arms: [a, b] };
}

/** Q2's five shapes, by the 2.2 arm ids. */
export const Q2_SHAPES: readonly string[] = [
  'agree:jev_gw,oa_primary', 'agree:jev_gw,oa_s2', 'fallback:jev_gw,oa_primary', 'fallback:jev_gw,oa_s2', 'fallback:oa_primary,jev_gw',
];

/**
 * A production shape: the site ships the kind (`policy.combos`), Jev is first and OpenAI second at `o_primary`
 * (decide.ts `renderingFor` forces it inside a combo), and both arms live in one refsure config (same `via`).
 * Everything else is a research cell (`bench_combinator`).
 */
export function isProductionShape(file: ArmsFile, shape: ComboShape, site: SiteId): boolean {
  const [a, b] = shape.arms.map((id) => armById(file, id)) as [Arm, Arm];
  const ships = SITES[site].policy.combos?.includes(shape.kind) ?? false;
  return ships && a.provider === 'jev' && b.provider === 'openai' && b.rendering === 'o_primary' && a.via === b.via;
}

/** The input a command passes, with the order of 2.3 (as items.ts `buildFor` adds it). */
export function inputFor(item: BenchItem, order: OrderLabel): unknown {
  if (!isCandidateSite(item.site)) return item.input;
  const salt = saltOf(order);
  return { ...item.input, order: salt === null ? { kind: 'shuffled' } : { kind: 'shuffled', salt } };
}

/**
 * The `ProviderAnswer` of a stored row's first answered attempt (status, answers, model, ms; no time cut). A row
 * that never answered replays its last failure. Refused rows (`refused:<cause>`) never reach a provider.
 */
export function replayAnswer(row: QualityRow, question: string): ProviderAnswer {
  const answered = row.attempts.find((attempt) => attempt.status === 'ok') ?? row.attempts.at(-1);
  const ms = answered?.provider_ms ?? 0;
  if (row.status === 'ok' && row.answer !== null && row.answer !== undefined) {
    return { status: 'ok', answers: { [question]: row.answer as DecisionAnswer }, model: row.model, usd: row.usd, ms };
  }
  return {
    status: row.status as ProviderStatus, answers: null, model: row.model, usd: null, ms,
    ...(row.detail === null ? {} : { detail: row.detail }),
  };
}

/** What a replay provider was asked: which provider, and the digest of the request it received. */
export interface AskedLog { provider: ProviderId; digest: string }

/** A provider that answers from `slot` (set per Decision) and logs every request it gets; it sends nothing. */
export function replayProvider(
  id: ProviderId, model: string, host: string, slot: Partial<Record<ProviderId, ProviderAnswer>>, log: AskedLog[],
): DecisionProvider {
  return {
    id, model, host,
    body: () => {
      throw new Error('a replay provider has no wire body');
    },
    ask: async (req) => {
      log.push({ provider: id, digest: req.digest });
      const answer = slot[id];
      if (!answer) return { status: 'transport', answers: null, model: null, usd: null, ms: 0, detail: `no stored ${id} answer` };
      return structuredClone(answer);
    },
  };
}

const NEVER = new AbortController().signal;

/** A research cell: the copied `askAgree` / `askFallback` on parts in the stated order (each at its 2.2 threshold). */
export function combineParts(kind: ComboKind, parts: readonly [ComboPart<unknown>, ComboPart<unknown>]): Promise<ComboOutcome<unknown>> {
  const opts = { deadlineMs: BOUNDS.DEADLINE_MS, signal: NEVER };
  return kind === 'agree' ? askAgree(parts, opts) : askFallback(parts[0], parts[1], opts);
}

/** One refsure config holding both arms' key slots (caps out of reach, as `armConfig`), and its two arms. */
export function comboConfig(file: ArmsFile, arms: readonly [Arm, Arm], stateDir: string, piiMasks: boolean): RefsureConfig {
  const [a, b] = arms.map((arm) => armConfig(file, arm, stateDir, piiMasks)) as [RefsureConfig, RefsureConfig];
  return {
    ...a,
    keys: { openrouter: a.keys.openrouter ?? b.keys.openrouter, openai: a.keys.openai ?? b.keys.openai, gateway: a.keys.gateway ?? b.keys.gateway },
    gateway: a.gateway ?? b.gateway,
  };
}

/** Grants consent for every provider host the config routes to, in its own state dir; returns the hosts. */
export function grantAll(config: RefsureConfig, env: NodeJS.ProcessEnv): Record<ProviderId, string> {
  const roster = providerRoster(config, keySet(config, env));
  const hosts = {} as Record<ProviderId, string>;
  let consent = null;
  for (const id of ['jev', 'openai'] as const) {
    const host = roster[id].endpoint?.host;
    if (!host) throw new Error(`the combo config routes no ${id} endpoint (${roster[id].problem ?? 'unknown'})`);
    hosts[id] = host;
    consent = withGrant(consent, id, host, new Date());
  }
  writeConsent(config.paths.consent, consent!);
  return hosts;
}

/** What a production Decision settled, and what its providers were asked. */
export interface Decision { verdict: Verdict<unknown>; route: string | null; asked: AskedLog[] }

/**
 * refsure's real `createDecide` over a production shape, one decider per mask mode. `providers` is either replay
 * providers (offline; `answers` per call) or, for the live check, real ones the caller wraps. Every Decision
 * runs on `combo: 'auto'`, exactly as the commands do; its egress log is cleared after each so caps never bind.
 */
export class ProductionDecider {
  private readonly deciders = new Map<boolean, { decide: DecideFn; config: RefsureConfig; trace: ReturnType<typeof newTrace> }>();
  private readonly slot: Partial<Record<ProviderId, ProviderAnswer>> = {};
  private readonly log: AskedLog[] = [];
  readonly root: string;

  constructor(
    private readonly file: ArmsFile,
    private readonly arms: readonly [Arm, Arm],
    private readonly real?: (config: RefsureConfig, hosts: Record<ProviderId, string>, log: AskedLog[]) => { jev: DecisionProvider; openai: DecisionProvider },
    root?: string,
  ) {
    this.root = root ?? mkdtempSync(join(tmpdir(), 'refsure-bench-combo-'));
  }

  private deciderFor(masks: boolean) {
    const known = this.deciders.get(masks);
    if (known) return known;
    const dir = mkdtempSync(join(this.root, masks ? 'masks-on-' : 'masks-off-'));
    const config = comboConfig(this.file, this.arms, dir, masks);
    // Offline, the key slots hold a placeholder: only presence is read, and replay providers send nothing.
    const env = this.real ? process.env : Object.fromEntries(this.arms.map((arm) => [arm.keyEnv, 'replay-placeholder']));
    const keys = keySet(config, env);
    const hosts = grantAll(config, env);
    const [jevArm, openaiArm] = this.arms;
    const providers = this.real
      ? this.real(config, hosts, this.log)
      : {
          jev: replayProvider('jev', jevArm.model, hosts.jev, this.slot, this.log),
          openai: replayProvider('openai', openaiArm.model, hosts.openai, this.slot, this.log),
        };
    const trace = newTrace();
    const { decide } = createDecide({ config, keys, providers, trace, command: 'bench-combos', pageProfile: () => null });
    const made = { decide, config, trace };
    this.deciders.set(masks, made);
    return made;
  }

  /** One Decision on `item` at `order`; offline, `answers` are what each provider hands back. */
  async decide(item: BenchItem, order: OrderLabel, answers?: Partial<Record<ProviderId, ProviderAnswer>>): Promise<Decision> {
    const made = this.deciderFor(item.masks ?? true);
    for (const id of ['jev', 'openai'] as const) delete this.slot[id];
    Object.assign(this.slot, answers ?? {});
    this.log.length = 0;
    made.trace.decisions.length = 0;
    const risk = riskOf(item.risk);
    const decided = await made.decide(SITES[item.site] as never, inputFor(item, order) as never, {
      combo: 'auto', originUrl: '', synthetic: true, dryRun: false, signal: NEVER, ...(risk === undefined ? {} : { risk }),
    });
    const route = made.trace.decisions.at(-1)?.provider ?? null;
    if (existsSync(made.config.paths.egressLog)) writeFileSync(made.config.paths.egressLog, '');
    return { verdict: decided.verdict as Verdict<unknown>, route: route === null ? null : String(route), asked: [...this.log] };
  }
}
