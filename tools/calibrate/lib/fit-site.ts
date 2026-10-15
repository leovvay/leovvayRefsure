import { RISK_ORDER } from '../../../src/risk';
import type { RiskClass } from '../../../src/risk';
import { dismissSite, findSite, locateSite, outcomeSite, pageStateSite, presenceSite } from '../../../src/questions';
import type { NoulBand, SiteId } from '../../../src/questions';
import type { FitOptions } from './fit-options';
import { fitLowerCumulative, fitUpperCumulative } from './cumulative';
import { fitLower, fitUpper } from './isotonic';
import type { Point } from './point';
import type { RunRow } from './run-row';
import type { SiteFit } from './site-fit';
import type { ThresholdFit } from './threshold-fit';
import { wilsonLow } from './wilson';

/*
  The fit per site (spec §9, plan step 1 "fit"; step 2 reuses it on Orca-native runs). A Choice site fits the
  lowest confidence at which the answers it would act on (a candidate or a state, never `none`) are right with
  precision ≥ target; a Noul site (outcome, presence) fits its band.
  - Every row is max(fitted, starting row), so calibration never loosens the starting rows. `opts.floor` raises
    the starting rows to an entry already shipped (step 2 never ships below step 1). Locate and find fit a row per
    risk label the set carries (a label with too few points uses the all-points fit); risks the set never labels
    take the all-points fit. Their rows never decrease along the risk order: `--risk` is the caller's claim and
    the page can only raise it, so naming a riskier row must never loosen the gate.
  - A fit that only certainty reaches (a row of 1.0) is no boundary on the confidence scale: one confident wrong
    answer below 1.0 puts it there, and one at 1.0 takes it away. Such a site keeps its declared rows.
  - HELD sites are fitted and reported, but stay at their declared maturity whatever the fit says: the thinning
    replay holds what only live lines can measure, and the Orca-native replay holds what its own fit would break.
*/

/** Sites a replay reports but does not make `measured`, and why: by step 1 (converted) and step 2 (native). */
const HELD: Readonly<Record<'converted' | 'native', Partial<Record<SiteId, string>>>> = {
  converted: {
    dismiss: 'held: dismiss ships inherited with the close/reject lexicon (spec §8.4); its lines are measured in the '
      + 'Orca-native replay (spec §9 step 2), as the converted candidates carry no overlay place and live ones always do',
  },
  native: {
    dismiss: 'held for the owner: the fit counts every pick, and its row (0.97 on these runs) abstains on a plain '
      + 'cookie wall answered "Reject all" at 0.95; every wrong pick at 0.6 or more is a never-click name the code '
      + 'veto refuses before any click. Dismiss stays inherited (0.6 with the close/reject lexicon) until a row is chosen',
  },
};

const SITES = {
  locate: locateSite, find: findSite, dismiss: dismissSite, 'page-state': pageStateSite, outcome: outcomeSite,
  presence: presenceSite,
} as const;
type FittedSite = keyof typeof SITES;
type ChoiceSite = 'locate' | 'find' | 'dismiss' | 'page-state';
type PerRisk = Readonly<Record<RiskClass, number>>;

function upper(points: readonly Point[], opts: FitOptions): ThresholdFit {
  const fit = (opts.method === 'cumulative' ? fitUpperCumulative : fitUpper)(points, opts.target, opts.minPoints);
  if (fit.value === null || fit.value < 1) return fit;
  return { ...fit, value: null, why: `no score below 1.0 reaches ${opts.target} (${fit.beyond} points at 1.0)` };
}

function lower(points: readonly Point[], opts: FitOptions): ThresholdFit {
  return (opts.method === 'cumulative' ? fitLowerCumulative : fitLower)(points, opts.target, opts.minPoints);
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function actedPoints(rows: readonly RunRow[]): (Point & { risk: string | null; set: string })[] {
  return rows
    .filter((row) => row.choice !== null && row.choice !== 'none' && row.confidence !== null)
    .map((row) => ({ score: row.confidence!, positive: row.correct === true, risk: row.risk, set: row.set ?? '' }));
}

/** A starting row raised to the floor's, where the floor has one of the same shape. */
function floored(start: number, floor: unknown, risk?: RiskClass): number {
  if (typeof floor === 'number') return Math.max(start, floor);
  if (risk !== undefined && typeof floor === 'object' && floor !== null) {
    const value = (floor as Record<string, unknown>)[risk];
    if (typeof value === 'number') return Math.max(start, value);
  }
  return start;
}

function choiceFit(site: ChoiceSite, rows: readonly RunRow[], opts: FitOptions) {
  const points = actedPoints(rows);
  const all = upper(points, opts);
  const fits: Record<string, ThresholdFit> = { all };
  const start = SITES[site].policy.threshold.jev;
  if (site !== 'locate' && site !== 'find') {
    const startRow = floored(start as number, opts.floor);
    const row = all.value === null ? null : Math.max(all.value, startRow);
    return { fits, starting: startRow, rows: row, why: all.value === null ? all.why : 'measured', rowOf: () => row ?? Infinity, points };
  }
  const startRows = {} as Record<RiskClass, number>;
  for (const risk of RISK_ORDER) startRows[risk] = floored((start as PerRisk)[risk], opts.floor, risk);
  if (all.value === null) {
    return { fits, starting: startRows, rows: null, why: all.why, rowOf: () => Infinity, points };
  }
  const labels = new Set(points.map((point) => point.risk).filter((risk): risk is string => risk !== null));
  let why = 'measured';
  const shipped: Record<string, number> = {};
  let floor = 0;
  for (const risk of RISK_ORDER) {
    let fitted = all.value;
    if (labels.has(risk)) {
      const own = upper(points.filter((point) => point.risk === risk), opts);
      fits[risk] = own;
      if (own.value !== null) fitted = own.value;
      else if (own.why.startsWith('no score')) why = `${risk}: ${own.why}`;
    }
    floor = Math.max(floor, fitted, startRows[risk]);
    shipped[risk] = floor;
  }
  const strictest = Math.max(...Object.values(shipped));
  const rowOf = (risk: string | null) => (risk !== null && risk in shipped ? shipped[risk]! : strictest);
  const measured = why === 'measured';
  return { fits, starting: startRows, rows: measured ? shipped : null, why, rowOf: measured ? rowOf : () => Infinity, points };
}

function noulFit(site: 'outcome' | 'presence', points: readonly (Point & { set: string })[], opts: FitOptions) {
  const yes = upper(points, opts);
  const no = lower(points, opts);
  const declared = SITES[site].policy.threshold.jev as NoulBand;
  const floor = (opts.floor ?? {}) as Partial<NoulBand>;
  const start: NoulBand = {
    yesAtLeast: Math.max(declared.yesAtLeast, floor.yesAtLeast ?? 0),
    noAtMost: Math.min(declared.noAtMost, floor.noAtMost ?? 1),
  };
  const band = yes.value === null ? null : {
    yesAtLeast: Math.max(yes.value, start.yesAtLeast),
    noAtMost: Math.min(no.value ?? start.noAtMost, start.noAtMost),
  };
  const acted = band === null ? [] : points.filter((point) => point.score >= band.yesAtLeast);
  return {
    fits: { yesAtLeast: yes, noAtMost: no }, starting: { ...start }, rows: band, acted,
    why: band === null ? `yes edge: ${yes.why}` : 'measured',
  };
}

/** Per set: answered runs, and the acted answers at the rows and how many were right. */
function bySet(usable: readonly RunRow[], acted: readonly { positive: boolean; set: string }[]) {
  const out: Record<string, { runs: number; acted: number; correct: number }> = {};
  for (const row of usable) {
    const key = row.set ?? '';
    out[key] = out[key] ?? { runs: 0, acted: 0, correct: 0 };
    out[key].runs += 1;
  }
  for (const point of acted) {
    const entry = out[point.set];
    if (entry === undefined) continue;
    entry.acted += 1;
    if (point.positive) entry.correct += 1;
  }
  return out;
}

/** Fits one site on its runs, pooled over every replay given. Rows of another site are ignored. */
export function fitSite(site: SiteId, rows: readonly RunRow[], opts: FitOptions): SiteFit {
  if (!(site in SITES)) throw new Error(`no calibration fit for site ${site}`);
  const known = SITES[site as FittedSite];
  const usable = rows.filter((row) => row.site === site && row.status === 'ok' && row.wording === known.wording.hash
    && row.choice !== null && row.confidence !== null);
  const base = { site, items: new Set(usable.map((row) => row.id)).size, runs: usable.length, skipped: rows.length - usable.length };
  const fit = site === 'outcome' || site === 'presence'
    ? noulFit(site, usable.map((row) => ({ score: row.noul ?? row.confidence!, positive: row.gold === 'true', set: row.set ?? '' })), opts)
    : (() => {
        const choice = choiceFit(site as ChoiceSite, usable, opts);
        return { ...choice, acted: choice.points.filter((point) => point.score >= choice.rowOf(point.risk)) };
      })();
  const correct = fit.acted.filter((point) => point.positive).length;
  const held = HELD[opts.native === true ? 'native' : 'converted'][site];
  return {
    ...base, fits: fit.fits, starting: fit.starting, rows: fit.rows,
    threshold: fit.rows !== null && held === undefined ? fit.rows : null,
    acted: fit.acted.length, correct,
    coverage: fit.rows === null || usable.length === 0 ? null : round4(fit.acted.length / usable.length),
    precision: fit.acted.length === 0 ? null : round4(correct / fit.acted.length),
    wilsonLow: wilsonLow(correct, fit.acted.length),
    bySet: bySet(usable, fit.acted),
    why: fit.rows !== null && held !== undefined ? held : fit.why,
  };
}
