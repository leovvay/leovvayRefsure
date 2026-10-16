import { bootstrapDraws, drawAt } from '../lib/stats';
import { CANDIDATE, SITES } from './readings';
import type { Unit } from './readings';
import { DANGER_SITES, VERDICT_POOL, r4 } from './verdict';
import type { Cell, Ctx, Table } from './verdict';

/*
  3.1's two pre-registered sensitivity readings of every verdict cell: the per-item mean over the `p0` rows `r1`-`r3`
  (`fixed` on the other sites) and over every shipped row of the item (8 on candidate sites), each with a cluster
  bootstrap by group. Never the verdict: the verdict reads one draw per item (the unit row).
*/

/** One item's means over its rows. */
interface ItemMean { group: string; acted: number; right: number; dangerous: number; answerable: boolean; eligible: boolean; rows: number }

function means(byKey: ReadonlyMap<string, Unit[]>): ItemMean[] {
  return [...byKey.keys()].sort().map((key) => {
    const list = byKey.get(key)!;
    const mean = (f: (u: Unit) => boolean) => list.filter(f).length / list.length;
    return { group: list[0]!.group, acted: mean((u) => u.acted), right: mean((u) => u.acted && u.correct), dangerous: mean((u) => u.dangerous),
      answerable: list[0]!.answerable, eligible: list[0]!.dangerEligible, rows: list.length };
  });
}

const precisionOf = (ms: readonly ItemMean[]) => { const a = ms.reduce((s, m) => s + m.acted, 0); return a === 0 ? Number.NaN : ms.reduce((s, m) => s + m.right, 0) / a; };
const coverageOf = (ms: readonly ItemMean[]) => { const n = ms.filter((m) => m.answerable); return n.length === 0 ? Number.NaN : n.reduce((s, m) => s + m.right, 0) / n.length; };
const dangerOf = (ms: readonly ItemMean[]) => { const n = ms.filter((m) => m.eligible); return n.length === 0 ? Number.NaN : n.reduce((s, m) => s + m.dangerous, 0) / n.length; };

function ci(ctx: Ctx, ms: readonly ItemMean[], stat: (ms: readonly ItemMean[]) => number): string {
  const draws = bootstrapDraws(ms, (m) => m.group, stat, { resamples: ctx.i.resamples });
  return `${r4(stat(ms))} [${r4(drawAt(draws, 0.025))}, ${r4(drawAt(draws, 0.975))}]`;
}

/** The rows of a reading: `r1-r3` = the unit order's repeats r1-r3; `all` = every shipped row of the item. */
function rowsOf(site: string, reading: 'r1-r3' | 'all', u: Unit): boolean {
  if (reading === 'all') return true;
  return u.order === (CANDIDATE.has(site) ? 'p0' : 'fixed') && ['r1', 'r2', 'r3'].includes(u.repeat ?? '');
}

export function repeatTable(ctx: Ctx): Table {
  const rows: Cell[][] = [];
  for (const site of SITES) {
    const pool = VERDICT_POOL[site];
    const arms = [...new Set(ctx.i.units.filter((u) => u.site === site && pool.includes(u.set)).map((u) => u.arm))].sort();
    for (const arm of arms) {
      // The items of the verdict cell itself (family, X3 and X7 exclusions applied; page-state native only).
      const cell = ctx.cell(arm, site, pool).units.filter((u) => site !== 'page-state' || u.origin === 'native');
      const keys = new Set(cell.map((u) => u.key));
      for (const reading of ['r1-r3', 'all'] as const) {
        const byKey = new Map<string, Unit[]>();
        for (const u of ctx.i.allUnits) {
          if (u.arm !== arm || u.site !== site || !keys.has(u.key) || u.familyBad || !rowsOf(site, reading, u)) continue;
          byKey.set(u.key, [...(byKey.get(u.key) ?? []), u]);
        }
        const ms = means(byKey);
        if (ms.length === 0) { rows.push([site, arm, reading, 0, null, ctx.miss(`P4 repeat rows of ${arm} at ${site}`), null, null]); continue; }
        const perItem = ms.reduce((s, m) => s + m.rows, 0) / ms.length;
        rows.push([site, arm, reading, ms.length, r4(perItem), ci(ctx, ms, precisionOf), ci(ctx, ms, coverageOf),
          DANGER_SITES.has(site) ? ci(ctx, ms, dangerOf) : null]);
      }
    }
  }
  return { anchor: 'repeats', section: 2, title: 'Per-item mean over repeats and orders (3.1 sensitivity, verdict cells, single arms)',
    columns: ['site', 'arm', 'rows read', 'items', 'rows per item', 'precision (sum of item means) [CI]', 'coverage [CI]', 'dangerous rate [CI]'], rows,
    notes: ['Each item contributes its mean acted, right and dangerous share over the rows read; precision = sum of right means / sum of acted means. Cluster bootstrap by group, 95% percentile.',
      'Sensitivity only: the verdict reads one draw per item. Combos are replayed from unit rows only, so they have no row here.'] };
}
