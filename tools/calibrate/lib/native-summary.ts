import { createHash } from 'node:crypto';
import type { NativeProvenance } from './native-provenance';
import type { RunRow } from './run-row';
import type { SetMeta } from './set-meta';
import type { SiteFit } from './site-fit';

const sum = (values: Record<string, number>): number => Object.values(values).reduce((a, b) => a + b, 0);

/** One hash for the sets a site pooled: the set's own sha256 when it is one, else over their names and hashes. */
export function pooledSha256(metas: readonly SetMeta[]): string {
  if (metas.length === 1) return metas[0]!.sha256;
  const lines = metas.map((meta) => `${meta.set}:${meta.sha256}`).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The fit with visual-only calls left out, as a reading beside the one that ships; it never ships itself. */
export function textOnlyOf(fit: SiteFit, visualOnlyCalls: number): NonNullable<NativeProvenance['textOnly']> {
  const why = fit.rows === null ? fit.why
    : 'rows on pages whose text carries the answer only; not shipped without an owner ruling on that scope';
  return {
    visualOnlyCalls, items: fit.items, runs: fit.runs, rows: fit.rows, acted: fit.acted, correct: fit.correct,
    coverage: fit.coverage, wilsonLow: fit.wilsonLow, why,
  };
}

/** A replay's reading of a site, for calibration.json's provenance. */
export function nativeSummary(
  fit: SiteFit, rows: readonly RunRow[], metas: readonly SetMeta[],
  ctx: { replays: number; model: string; route: string; date: string; textOnly?: NativeProvenance['textOnly'] },
): NativeProvenance {
  const fitted: Record<string, number | null> = {};
  for (const [name, edge] of Object.entries(fit.fits)) fitted[name] = edge.value;
  return {
    sets: metas.map((meta) => ({
      set: meta.set, sha256: meta.sha256, asked: meta.native?.asked ?? meta.kept, code: meta.native?.code ?? 0,
      codeCorrect: meta.native?.codeCorrect ?? 0, dropped: sum(meta.native?.dropped ?? {}),
      goldNotOffered: meta.native?.goldNotOffered ?? 0,
    })),
    runs: fit.runs, items: fit.items, ...(fit.masks === undefined ? {} : { masks: fit.masks }),
    orders: new Set(rows.map((row) => row.salt)).size, replays: ctx.replays, model: ctx.model, route: ctx.route,
    rows: fit.rows, fitted, acted: fit.acted, correct: fit.correct, coverage: fit.coverage, precision: fit.precision,
    wilsonLow: fit.wilsonLow, why: fit.why, ...(ctx.textOnly === undefined ? {} : { textOnly: ctx.textOnly }),
    date: ctx.date,
  };
}
