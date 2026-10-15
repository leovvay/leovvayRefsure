import { RISK_ORDER } from '../../../src/risk';
import type { RiskClass } from '../../../src/risk';
import { dismissSite, locateSite, outcomeSite, pageStateSite } from '../../../src/questions';
import type { NoulBand, SiteId } from '../../../src/questions';
import type { FitOptions } from './fit-options';
import { fitLowerCumulative, fitUpperCumulative } from './cumulative';
import { fitLower, fitUpper } from './isotonic';
import type { Point } from './point';
import type { RunRow } from './run-row';
import type { SiteFit } from './site-fit';
import type { ThresholdFit } from './threshold-fit';

/*
  The fit per site (spec §9, plan step 1 "fit"). A Choice site fits the lowest confidence at which the answers it
  would act on (a candidate or a state, never `none`) are right with precision ≥ target; a Noul site fits its band.
  - Every row is max(fitted, starting row), so calibration never loosens the starting rows. Locate fits a row per
    risk label the set carries (a label with too few points uses the all-points fit); risks the set never labels
    take the all-points fit. Locate's rows never decrease along the risk order: `--risk` is the caller's claim and
    the page can only raise it, so naming a riskier row must never loosen the gate (a write row under the read row
    would let `--risk write` act on a read pick below the read row).
  - A fit that only certainty reaches (a row of 1.0) is no boundary on the confidence scale: one confident wrong
    answer below 1.0 puts it there, and one at 1.0 takes it away. Such a site keeps its declared rows.
  - HELD sites are fitted and reported, but stay at their declared maturity whatever the fit says.
*/

/** Sites step 1 reports but does not make `measured`, and why. */
const HELD: Readonly<Partial<Record<SiteId, string>>> = {
  dismiss: 'held: dismiss ships inherited with the close/reject lexicon (spec §8.4); its lines are measured in the '
    + 'Orca-native replay (spec §9 step 2), as the converted candidates carry no overlay place and live ones always do',
};

function upper(points: readonly Point[], opts: FitOptions): ThresholdFit {
  const fit = (opts.method === 'cumulative' ? fitUpperCumulative : fitUpper)(points, opts.target, opts.minPoints);
  if (fit.value === null || fit.value < 1) return fit;
  return { ...fit, value: null, why: `no score below 1.0 reaches ${opts.target} (${fit.beyond} points at 1.0)` };
}

function lower(points: readonly Point[], opts: FitOptions): ThresholdFit {
  return (opts.method === 'cumulative' ? fitLowerCumulative : fitLower)(points, opts.target, opts.minPoints);
}

const SITES = { locate: locateSite, dismiss: dismissSite, 'page-state': pageStateSite, outcome: outcomeSite } as const;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function actedPoints(rows: readonly RunRow[]): (Point & { risk: string | null })[] {
  return rows
    .filter((row) => row.choice !== null && row.choice !== 'none' && row.confidence !== null)
    .map((row) => ({ score: row.confidence!, positive: row.correct === true, risk: row.risk }));
}

function choiceFit(site: 'locate' | 'dismiss' | 'page-state', rows: readonly RunRow[], opts: FitOptions) {
  const points = actedPoints(rows);
  const all = upper(points, opts);
  const fits: Record<string, ThresholdFit> = { all };
  const start = SITES[site].policy.threshold.jev;
  if (site !== 'locate') {
    const startRow = start as number;
    const row = all.value === null ? null : Math.max(all.value, startRow);
    return { fits, starting: startRow, rows: row, why: all.value === null ? all.why : 'measured', rowOf: () => row ?? Infinity, points };
  }
  const startRows = start as Readonly<Record<RiskClass, number>>;
  if (all.value === null) {
    return { fits, starting: { ...startRows }, rows: null, why: all.why, rowOf: () => Infinity, points };
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
  return { fits, starting: { ...startRows }, rows: measured ? shipped : null, why, rowOf: measured ? rowOf : () => Infinity, points };
}

function outcomeFit(points: readonly Point[], opts: FitOptions) {
  const yes = upper(points, opts);
  const no = lower(points, opts);
  const start = outcomeSite.policy.threshold.jev as NoulBand;
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

/** Fits one site on its runs, pooled over every replay given. Rows of another site are ignored. */
export function fitSite(site: SiteId, rows: readonly RunRow[], opts: FitOptions): SiteFit {
  if (!(site in SITES)) throw new Error(`no calibration fit for site ${site}`);
  const known = SITES[site as keyof typeof SITES];
  const usable = rows.filter((row) => row.site === site && row.status === 'ok' && row.wording === known.wording.hash
    && row.choice !== null && row.confidence !== null);
  const base = { site, items: new Set(usable.map((row) => row.id)).size, runs: usable.length, skipped: rows.length - usable.length };
  const fit = site === 'outcome'
    ? outcomeFit(usable.map((row) => ({ score: row.noul ?? row.confidence!, positive: row.gold === 'true' })), opts)
    : (() => {
        const choice = choiceFit(site as 'locate' | 'dismiss' | 'page-state', usable, opts);
        return { ...choice, acted: choice.points.filter((point) => point.score >= choice.rowOf(point.risk)) };
      })();
  const correct = fit.acted.filter((point) => point.positive).length;
  const held = HELD[site];
  return {
    ...base, fits: fit.fits, starting: fit.starting, rows: fit.rows,
    threshold: fit.rows !== null && held === undefined ? fit.rows : null,
    acted: fit.acted.length, correct,
    coverage: fit.rows === null || usable.length === 0 ? null : round4(fit.acted.length / usable.length),
    precision: fit.acted.length === 0 ? null : round4(correct / fit.acted.length),
    why: fit.rows !== null && held !== undefined ? held : fit.why,
  };
}
