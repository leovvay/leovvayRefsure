import { KNOWN_FAMILIES, SITES } from '../../../src/questions';
import type { CalibrationEntry, SiteId } from '../../../src/questions';
import type { FitOptions } from './fit-options';
import type { HeldRecord } from './held-record';
import type { NativeProvenance } from './native-provenance';
import { pooledSha256 } from './native-summary';
import type { RunRow } from './run-row';
import type { SetMeta } from './set-meta';
import type { ShippedEntry } from './shipped-entry';
import type { SiteFit } from './site-fit';

/*
  What fit.ts writes into calibration.json for one site: a `measured` entry when the pooled fit ships a row, else
  a held record that keeps the evidence and the reading on file while the site keeps its declared rows.
*/

const SOURCES = {
  converted: 'frozen browser benchmark sets, 2026-10-13 (not published)',
  refsure: 'refsure-authored synthetic sets (tools/calibrate/sets)',
  frozen: 'frozen browser benchmark sets with stored pages, 2026-10-13 (not published)',
} as const;
const METHODS = {
  isotonic: 'isotonic fit (pool-adjacent-violators) of acted answers on confidence, pooled over every replay; lowest score below 1.0 with calibrated precision at or above the target and at least min-points answers beyond it',
  cumulative: 'lowest confidence below 1.0 at which the acted answers at or above it, pooled over every replay, reach the target precision, with at least min-points of them',
} as const;
const ROWS = 'each row max(fitted, starting row), non-decreasing along the risk order; a risk label gets its own row only with min-items pages and at least one wrong answer';

export interface RecordContext {
  opts: FitOptions;
  replays: number;
  model: string;
  route: string;
  date: string;
  /** Overrides the source named from the sets. */
  source?: string;
}

/** Where a site's sets came from, named without publishing them: converted sets, then the Orca-native ones. */
export function sourceOf(sets: readonly SetMeta[]): string {
  const converted = sets.some((meta) => meta.native === undefined);
  const origins = [...new Set(sets.filter((meta) => meta.native !== undefined).map((meta) => meta.native?.origin ?? 'frozen'))]
    .sort().reverse();
  const native = origins.length === 0 ? [] : [`${origins.map((origin) => SOURCES[origin]).join(' and ')}, replayed in Orca`];
  return [...(converted ? [SOURCES.converted] : []), ...native].join('; ');
}

export function sameKey(record: Pick<CalibrationEntry, 'site' | 'provider' | 'modelFamily' | 'lineFormat' | 'wordingHash'>, site: SiteId): boolean {
  return record.site === site && record.provider === 'jev' && record.modelFamily === KNOWN_FAMILIES.jev
    && record.lineFormat === 1 && record.wordingHash === SITES[site].wording.hash;
}

/** The set names a shipped entry or held record says it was fitted on. */
export function setsOf(record: ShippedEntry | HeldRecord): string[] {
  if ('pooled' in record) return [...record.pooled.sets, ...(record.native?.sets ?? [])].map((set) => set.set);
  const own = record.provenance.set.split(',').map((name) => name.trim()).filter((name) => name !== '');
  return [...own, ...(record.provenance.native?.sets ?? []).map((set) => set.set)];
}

/** A `measured` entry: the pooled fit's rows, with its provenance. */
export function entryFor(fit: SiteFit, rows: readonly RunRow[], sets: readonly SetMeta[], ctx: RecordContext): ShippedEntry {
  const fitted: Record<string, number | null> = {};
  for (const [name, edge] of Object.entries(fit.fits)) fitted[name] = edge.value;
  return {
    site: fit.site, wordingHash: SITES[fit.site].wording.hash, lineFormat: 1, modelFamily: KNOWN_FAMILIES.jev,
    provider: 'jev', threshold: fit.threshold!, setSha256: pooledSha256(sets), n: fit.runs,
    coverageAtP99: fit.coverage ?? 0, precisionAtP99: fit.precision ?? 0, date: ctx.date,
    provenance: {
      source: ctx.source ?? sourceOf(sets), set: sets.map((meta) => meta.set).join(', '), items: fit.items,
      ...(fit.masks === undefined ? {} : { masks: fit.masks }), runs: fit.runs,
      orders: new Set(rows.map((row) => row.salt)).size, replays: ctx.replays, model: ctx.model, route: ctx.route,
      method: `${METHODS[ctx.opts.method]}; ${ROWS}`, target: ctx.opts.target, minPoints: ctx.opts.minPoints,
      minItems: ctx.opts.minItems, fitted, acted: fit.acted, correct: fit.correct, wilsonLow: fit.wilsonLow,
    },
  };
}

/** A held site: what refsure keeps using, why, and the readings that did not ship. */
export function heldFor(
  fit: SiteFit, pooled: NativeProvenance, ctx: RecordContext,
  extra: { native?: NativeProvenance; replaced?: ShippedEntry | NonNullable<HeldRecord['replaced']> },
): HeldRecord {
  const policy = SITES[fit.site].policy;
  const replaced = extra.replaced === undefined || !('provenance' in extra.replaced) ? extra.replaced
    : { threshold: extra.replaced.threshold, set: extra.replaced.provenance.set, n: extra.replaced.n, date: extra.replaced.date };
  return {
    site: fit.site, wordingHash: SITES[fit.site].wording.hash, lineFormat: 1, modelFamily: KNOWN_FAMILIES.jev,
    provider: 'jev', ships: { maturity: policy.maturity, rows: policy.threshold.jev as CalibrationEntry['threshold'] },
    why: fit.why, date: ctx.date, pooled, ...(extra.native === undefined ? {} : { native: extra.native }),
    ...(replaced === undefined ? {} : { replaced }),
  };
}
