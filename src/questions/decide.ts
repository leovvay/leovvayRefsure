import { approve, checkLimits, checkOrigin, isEgressRefusal, readEgressLog } from '../egress';
import type { EgressRefusal } from '../egress';
import { DryRunStop } from '../output';
import { askAgree, askFallback, askOne, keyPresent, providerRoster } from '../providers';
import type { ComboOutcome, ComboPart, Rendering } from '../providers';
import { decisionInfo, loggedProvider, readAnswers } from './asking';
import { BOUNDS } from './bounds';
import { thresholdFor } from './calibration';
import type { DecideDeps } from './decide-deps';
import type { DecideFn, DecideOpts, Decided, RouteCheckFn } from './decide-fn';
import type { DecisionSite } from './decision-site';
import { planRoute, readReadiness } from './route';
import type { RoutePlan } from './route';
import type { Maturity, ProviderId } from './site-id';
import type { AbstainCause, Verdict } from './verdict';

const DAY_MS = 86_400_000;

function abstain<Out>(cause: AbstainCause, detail: string): Verdict<Out> {
  return { kind: 'abstain', cause, detail, leaned: null, confidence: null, threshold: null };
}

/** OpenAI's input rendering: sectioned text only when it answers a presence check alone (spec §7.1). */
function renderingFor(site: DecisionSite<unknown, unknown, unknown>['id'], plan: RoutePlan): Rendering {
  return site === 'presence' && plan.kind === 'single' ? 'o_s2' : 'o_primary';
}

/** The caps against egress.log as it is now, calls made earlier in this Decision included. */
function capsNow(config: DecideDeps['config']): EgressRefusal | null {
  const nowMs = Date.now();
  const limits = checkLimits(readEgressLog(config.paths.egressLog, nowMs - DAY_MS), config, nowMs);
  return limits === 'ok' ? null : limits;
}

function idsOf(plan: Exclude<RoutePlan, { kind: 'refused' }>): ProviderId[] {
  return plan.kind === 'single' ? [plan.provider] : ['jev', 'openai'];
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
    const nowMs = Date.now();
    const logged = readEgressLog(deps.config.paths.egressLog, nowMs - DAY_MS);
    const caps = checkLimits(logged, deps.config, nowMs, plan.kind === 'agree' ? 1 : 0);
    if (caps !== 'ok') return { ok: false, cause: 'spend_limit', detail: caps.detail };
    return { ok: true, calls: idsOf(plan).length };
  };

  const decide: DecideFn = async <In, Ctx, Out>(
    site: DecisionSite<In, Ctx, Out>,
    input: In,
    opts: DecideOpts,
  ): Promise<Decided<Out>> => {
    const wording = site.wordingFor?.(input) ?? site.wording;
    const declared: Maturity = site.maturityFor?.(input) ?? site.policy.maturity;
    const settle = (verdict: Verdict<Out>): Decided<Out> => ({ verdict, maturity: declared, modelChanged: false, newFamily: false });

    const plan = await route(site as DecisionSite<unknown, unknown, unknown>, opts);
    if (plan.kind === 'refused') return settle(abstain(plan.cause, plan.detail));
    const { request, context } = site.build(input);
    const nowMs = Date.now();
    const egressLog = readEgressLog(deps.config.paths.egressLog, nowMs - DAY_MS);
    const parts: ComboPart<Out>[] = [];
    for (const id of idsOf(plan)) {
      const provider = deps.providers[id];
      const threshold = thresholdFor(site, id, opts.risk, provider?.model, wording.hash);
      if (!provider || threshold === null) return settle(abstain('provider_not_allowed', `${id} may not answer ${site.id}`));
      // Every call counts toward the cap (spec §7.1): `agree` asks its parts at once, so each counts the ones
      // before it; `fallback` asks OpenAI only after Jev, so OpenAI is admitted again then, Jev's call logged.
      const approved = approve(request, {
        site: site.id, provider: id, host: provider.host, originUrl: opts.synthetic ? null : opts.originUrl,
        profileId: deps.pageProfile(),
        config: deps.config, dryRun: opts.dryRun, nowMs, egressLog, pending: plan.kind === 'agree' ? parts.length : 0,
      });
      if (isEgressRefusal(approved)) return settle(abstain(approved.cause, approved.detail));
      const part: ComboPart<Out> = {
        provider: loggedProvider(provider, { egressLog: deps.config.paths.egressLog, command: deps.command, site: site.id, trace: deps.trace }),
        request: approved,
        question: site.question,
        threshold,
        read: (answer, bound) => site.read(answer, context, bound),
      };
      if (id === 'openai') part.rendering = renderingFor(site.id, plan);
      if (plan.kind === 'fallback' && parts.length > 0) part.admit = () => capsNow(deps.config);
      parts.push(part);
    }

    if (opts.dryRun) {
      // The exact bodies a granted run would send, already redacted and masked by `approve`; nothing leaves.
      for (const part of parts) {
        const rendering = part.rendering === undefined ? {} : { rendering: part.rendering };
        deps.trace.dryRun.push({ provider: part.provider.id, host: part.provider.host, body: part.provider.body(part.request, rendering) });
      }
      throw new DryRunStop();
    }
    if (opts.signal.aborted) return settle(abstain('provider_error', 'interrupted before any provider was asked'));

    const started = performance.now();
    const asking = { deadlineMs: BOUNDS.DEADLINE_MS, signal: opts.signal };
    const [first, second] = parts as [ComboPart<Out>, ComboPart<Out> | undefined];
    let outcome: ComboOutcome<Out>;
    if (plan.kind === 'agree') outcome = await askAgree(parts, asking);
    else if (plan.kind === 'fallback' && second) outcome = await askFallback(first, second, asking);
    else {
      const only = await askOne(first, asking);
      outcome = { verdict: only.verdict, parts: [only] };
    }
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
    return {
      verdict: outcome.verdict,
      maturity: reading.maturity,
      modelChanged: reading.modelChanged,
      newFamily: reading.newFamily,
    };
  };

  return { decide, routeCheck };
}
