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
  Every shipped row is max(fitted, starting row), so calibration never loosens the starting rows, and locate's rows
  never decrease along the risk order. Locate fits a row per risk label the set carries; a label with too few points
  falls back to the all-points fit, and risks the set never labels take the all-points fit as their floor.
*/

function upper(points: readonly Point[], opts: FitOptions): ThresholdFit {
  return (opts.method === 'cumulative' ? fitUpperCumulative : fitUpper)(points, opts.target, opts.minPoints);
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
    const rowOf = () => row ?? Infinity;
    return { fits, starting: startRow, threshold: row, why: all.value === null ? all.why : 'measured', rowOf, points };
  }
  const startRows = start as Readonly<Record<RiskClass, number>>;
  if (all.value === null) {
    return { fits, starting: { ...startRows }, threshold: null, why: all.why, rowOf: () => Infinity, points };
  }
  const labels = [...new Set(points.map((point) => point.risk).filter((risk): risk is string => risk !== null))];
  let why = 'measured';
  const shipped: Record<string, number> = {};
  let floor = 0;
  for (const risk of RISK_ORDER) {
    let fitted = all.value;
    if (labels.includes(risk)) {
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
  return { fits, starting: { ...startRows }, threshold: why === 'measured' ? shipped : null, why, rowOf, points };
}

/** Fits one site on its runs. `rows` must all be the site's; others are ignored. */
export function fitSite(site: SiteId, rows: readonly RunRow[], opts: FitOptions): SiteFit {
  if (!(site in SITES)) throw new Error(`no calibration fit for site ${site}`);
  const known = SITES[site as keyof typeof SITES];
  const usable = rows.filter((row) => row.site === site && row.status === 'ok' && row.wording === known.wording.hash
    && row.choice !== null && row.confidence !== null);
  const base = { site, items: new Set(usable.map((row) => row.id)).size, runs: usable.length, skipped: rows.length - usable.length };
  if (site === 'outcome') {
    const points = usable.map((row) => ({ score: row.noul ?? row.confidence!, positive: row.gold === 'true' }));
    const yes = upper(points, opts);
    const no = lower(points, opts);
    const start = outcomeSite.policy.threshold.jev as NoulBand;
    const band = yes.value === null ? null : {
      yesAtLeast: Math.max(yes.value, start.yesAtLeast),
      noAtMost: Math.min(no.value ?? start.noAtMost, start.noAtMost),
    };
    const acted = band === null ? [] : points.filter((point) => point.score >= band.yesAtLeast);
    const correct = acted.filter((point) => point.positive).length;
    return {
      ...base, fits: { yesAtLeast: yes, noAtMost: no }, starting: { ...start }, threshold: band,
      acted: acted.length, correct,
      coverage: band === null || points.length === 0 ? null : round4(acted.length / points.length),
      precision: acted.length === 0 ? null : round4(correct / acted.length),
      why: band === null ? `yes edge: ${yes.why}` : 'measured',
    };
  }
  const fit = choiceFit(site as 'locate' | 'dismiss' | 'page-state', usable, opts);
  const acted = fit.points.filter((point) => point.score >= fit.rowOf(point.risk));
  const correct = acted.filter((point) => point.positive).length;
  return {
    ...base, fits: fit.fits, starting: fit.starting, threshold: fit.threshold, acted: acted.length, correct,
    coverage: fit.threshold === null || usable.length === 0 ? null : round4(acted.length / usable.length),
    precision: acted.length === 0 ? null : round4(correct / acted.length),
    why: fit.why,
  };
}
