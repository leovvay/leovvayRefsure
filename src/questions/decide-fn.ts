import type { RiskClass } from '../risk';
import type { DecisionSite } from './decision-site';
import type { Maturity } from './site-id';
import type { Verdict } from './verdict';

export interface DecideOpts {
  /** Picks the risk row of a per-risk threshold; the strictest row when absent (spec §6.1). */
  risk?: RiskClass;
  /** `auto` applies the spec §13 defaults for the site. */
  combo?: 'auto' | 'jev' | 'openai' | 'agree' | 'fallback';
  /** The page URL, checked against allow/deny origins. */
  originUrl: string;
  /**
   * The input is refsure's own fixed text, not a page (`doctor --ping`): origin and profile rules, which guard page
   * content, do not apply. Consent, masks, bounds and caps still do.
   */
  synthetic?: boolean;
  /** Build and approve (consent skipped), push the exact body to `trace.dryRun`, then throw `DryRunStop`. */
  dryRun: boolean;
  signal: AbortSignal;
}

export interface Decided<Out> {
  verdict: Verdict<Out>;
  maturity: Maturity;
  /** A different dated snapshot of a known model family answered. */
  modelChanged: boolean;
  /** A model family refsure has never been calibrated on answered: authority `none`. */
  newFamily: boolean;
}

/** Hides providers, combos, egress, consent and limits from every command. */
export type DecideFn = <In, Ctx, Out>(site: DecisionSite<In, Ctx, Out>, input: In, opts: DecideOpts) => Promise<Decided<Out>>;

/** Whether a site could be asked now (keys, consent, allowlist), without asking: lets acts refuse before dispatch. */
export type RouteCheckFn = (site: DecisionSite<unknown, unknown, unknown>, opts: Pick<DecideOpts, 'combo' | 'originUrl' | 'dryRun'>) =>
  Promise<{ ok: true } | { ok: false; cause: 'not_set_up' | 'provider_not_allowed' | 'origin_denied'; detail: string }>;
