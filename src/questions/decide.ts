import { approve, checkLimits, checkOrigin, isEgressRefusal, readEgressLog } from '../egress';
import type { EgressRefusal } from '../egress';
import { DryRunStop } from '../output';
import type { RunTrace } from '../output';
import { askAgree, askFallback, askOne, keyPresent, providerRoster } from '../providers';
import type { AskOptions, ComboOutcome, ComboPart, Rendering } from '../providers';
import { decisionInfo, loggedProvider, readAnswers } from './asking';
import { BOUNDS } from './bounds';
import { thresholdFor } from './calibration';
import type { DecideDeps } from './decide-deps';
import type { DecideFn, DecideOpts, Decided, RouteCheckFn } from './decide-fn';
import type { DecisionSite } from './decision-site';
import { planRoute, readReadiness } from './route';
import type { RoutePlan } from './route';
import { sentTwins, stopSentTwin } from './sent-twins';
import { type Maturity, PROVIDER_IDS, type ProviderId } from './site-id';
import type { SiteRequest } from './site-request';
import { abstainVerdict as abstain } from './abstain-verdict';
import type { Verdict } from './verdict';

const DAY_MS = 86_400_000;

type Plan = Exclude<RoutePlan, { kind: 'refused' }>;

/** OpenAI's input rendering: sectioned text only when it answers a presence check alone (spec §7.1). */
function renderingFor(site: DecisionSite<unknown, unknown, unknown>['id'], plan: RoutePlan): Rendering {
  return site === 'presence' && plan.kind === 'single' ? 'o_s2' : 'o_primary';
}

/**
 * The caps against egress.log as it is now, calls made earlier in this Decision included, with room for `pending`
 * more calls asked at the same moment.
 */
function capsNow(config: DecideDeps['config'], pending = 0): EgressRefusal | null {
  const nowMs = Date.now();
  const limits = checkLimits(readEgressLog(config.paths.egressLog, nowMs - DAY_MS), config, nowMs, pending);
  return limits === 'ok' ? null : limits;
}

function idsOf(plan: Plan): ProviderId[] {
  return plan.kind === 'single' ? [plan.provider] : [...PROVIDER_IDS];
}

/**
 * One approved part per provider on the route, or the abstain that stops the Decision before anything is asked.
 * Every call counts toward the cap (spec §7.1): `agree` asks its parts at once, so each counts the ones before it;
 * `fallback` asks OpenAI only after Jev, so OpenAI is admitted again then, Jev's call logged. Each part reads its
 * answer against the options as that part sent them.
 */
function buildParts<In, Ctx, Out>(
  deps: DecideDeps,
  site: DecisionSite<In, Ctx, Out>,
  plan: Plan,
  built: { request: SiteRequest; context: Ctx },
  opts: DecideOpts,
  wordingHash: string,
): ComboPart<Out>[] | Verdict<Out> {
  const nowMs = Date.now();
  const egressLog = readEgressLog(deps.config.paths.egressLog, nowMs - DAY_MS);
  const parts: ComboPart<Out>[] = [];
  for (const id of idsOf(plan)) {
    const provider = deps.providers[id];
    const threshold = thresholdFor(site, id, opts.risk, provider?.model, wordingHash);
    if (!provider || threshold === null) return abstain('provider_not_allowed', `${id} may not answer ${site.id}`);
    const approved = approve(built.request, {
      site: site.id, provider: id, host: provider.host, originUrl: opts.synthetic ? null : opts.originUrl,
      profileId: deps.pageProfile(),
      config: deps.config, dryRun: opts.dryRun, nowMs, egressLog, pending: plan.kind === 'agree' ? parts.length : 0,
    });
    if (isEgressRefusal(approved)) return abstain(approved.cause, approved.detail);
    const twins = sentTwins(approved, site.question);
    const part: ComboPart<Out> = {
      provider: loggedProvider(provider, { egressLog: deps.config.paths.egressLog, command: deps.command, site: site.id, trace: deps.trace }),
      request: approved,
      question: site.question,
      threshold,
      read: (answer, bound) => stopSentTwin(site.read(answer, built.context, bound), twins),
    };
    if (id === 'openai') part.rendering = renderingFor(site.id, plan);
    if (plan.kind === 'fallback' && parts.length > 0) part.admit = () => capsNow(deps.config);
    parts.push(part);
  }
  return parts;
}

/** The exact bodies a granted run would send, already redacted and masked by `approve`; nothing leaves. */
function dryRunStop<Out>(parts: readonly ComboPart<Out>[], trace: RunTrace): never {
  for (const part of parts) {
    const rendering = part.rendering === undefined ? {} : { rendering: part.rendering };
    trace.dryRun.push({ provider: part.provider.id, host: part.provider.host, body: part.provider.body(part.request, rendering) });
  }
  throw new DryRunStop();
}

/** Asks the route's parts: both at once for `agree`, Jev then OpenAI for `fallback`, else the one. */
async function askPlan<Out>(plan: Plan, parts: readonly ComboPart<Out>[], asking: AskOptions): Promise<ComboOutcome<Out>> {
  const [first, second] = parts as readonly [ComboPart<Out>, ComboPart<Out> | undefined];
  if (plan.kind === 'agree') return askAgree(parts, asking);
  if (plan.kind === 'fallback' && second) return askFallback(first, second, asking);
  const only = await askOne(first, asking);
  return { verdict: only.verdict, parts: [only] };
}

/**
 * The real `DecideFn` (spec §5.2, §8.2) and the route check acts use to refuse before dispatch. Per Decision:
 * route (site allowlist ∩ providers with a key ∩ consent), build, approve every part through the egress
 * pipeline, ask (one, `agree` or `fallback`; every call logged), then read maturity from the answering models.
 */
export function createDecide(deps: DecideDeps): { decide: DecideFn; routeCheck: RouteCheckFn } {
  const roster = providerRoster(deps.config, deps.keys);
  const keys = new Map<ProviderId, Promise<boolean>>();
  const inputs = {
    config: deps.config,
    roster,
    providers: deps.providers,
    keyPresent(id: ProviderId): Promise<boolean> {
      let present = keys.get(id);
      if (!present) {
        present = keyPresent(roster[id]);
        keys.set(id, present);
      }
      return present;
    },
  };
  const route = async (
    site: DecisionSite<unknown, unknown, unknown>,
    opts: Pick<DecideOpts, 'combo' | 'dryRun'>,
  ): Promise<RoutePlan> => planRoute(site.id, site.policy, opts.combo ?? 'auto', await readReadiness(inputs, opts.dryRun));

  const routeCheck: RouteCheckFn = async (site, opts) => {
    const plan = await route(site, opts);
    if (plan.kind === 'refused') return { ok: false, cause: plan.cause, detail: plan.detail };
    const origin = checkOrigin(opts.originUrl, deps.config, deps.pageProfile());
    if (origin !== 'ok') return { ok: false, cause: 'origin_denied', detail: origin.detail };
    // The caps as `approve` will read them: an `agree` needs room for both of its calls at once.
    const caps = capsNow(deps.config, plan.kind === 'agree' ? 1 : 0);
    if (caps) return { ok: false, cause: 'spend_limit', detail: caps.detail };
    return { ok: true, calls: idsOf(plan).length };
  };

  const decide: DecideFn = async <In, Ctx, Out>(
    site: DecisionSite<In, Ctx, Out>,
    input: In,
    opts: DecideOpts,
  ): Promise<Decided<Out>> => {
    const wording = site.wordingFor?.(input) ?? site.wording;
    const declared: Maturity = site.maturityFor?.(input) ?? site.policy.maturity;
    const settle = (verdict: Verdict<Out>): Decided<Out> => ({ verdict, maturity: declared, newFamily: false });

    const plan = await route(site as DecisionSite<unknown, unknown, unknown>, opts);
    if (plan.kind === 'refused') return settle(abstain(plan.cause, plan.detail));
    const parts = buildParts(deps, site, plan, site.build(input), opts, wording.hash);
    if (!Array.isArray(parts)) return settle(parts);
    if (opts.dryRun) dryRunStop(parts, deps.trace);
    if (opts.signal.aborted) return settle(abstain('provider_error', 'interrupted before any provider was asked'));

    const started = performance.now();
    const outcome = await askPlan(plan, parts, { deadlineMs: BOUNDS.DEADLINE_MS, signal: opts.signal });
    const ms = Math.round(performance.now() - started);

    const reading = readAnswers(site, wording.hash, declared, outcome.parts, outcome.verdict);
    deps.trace.decisions.push(decisionInfo({
      site: site.id,
      wording,
      provider: plan.kind === 'single' ? plan.provider : plan.kind,
      verdict: outcome.verdict,
      parts: outcome.parts,
      reading,
      ms,
    }));
    return { verdict: outcome.verdict, maturity: reading.maturity, newFamily: reading.newFamily };
  };

  return { decide, routeCheck };
}
