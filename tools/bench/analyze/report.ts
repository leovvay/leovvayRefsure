import { SITES } from './readings';
import type { Site } from './readings';
import { injectionTable } from './injection';
import { repeatTable } from './repeats';
import {
  Ctx, ablationTable, comboTable, costTable, formatTable, ownerTables, piiTable, q3Table, renderingTable, routeTable, siteTable,
  siteVerdict, sliceTable, stabilityTable, timingTables,
} from './verdict';
import type { Inputs, Report, SiteVerdict, Table } from './verdict';

/** Everything section 5 and 4.4 print, in 9.1 order, plus the inputs that were missing. */
export function analyze(i: Inputs, extra: { egress: { checked: number; hits: string[]; unlisted?: string[] } | null; crosscheck: Record<string, unknown> | null }): Report {
  const ctx = new Ctx(i);
  const verdicts = new Map<Site, SiteVerdict>(SITES.map((s) => [s, siteVerdict(ctx, s)]));
  const q3 = q3Table(ctx);
  const owner = ownerTables(ctx, verdicts, q3.d3);
  const tables: Table[] = [
    ...owner.tables,
    { anchor: 'q1', section: 2, title: 'Default arm per site (Q1, 5.5)', columns: ['site', 'verdict', 'candidates (status)', 'notes'],
      rows: SITES.map((s) => { const v = verdicts.get(s)!; return [s, v.text, v.evals.map((e) => `${e.cand.id}${e.cand.incumbent ? '*' : ''}: ${e.status}`).join('; '), v.notes.join('; ') || null]; }),
      notes: ['* = incumbent. Candidates are the routes refsure takes today; jev_or, research arms and bench_combinator cells are printed beside in each site table.'] },
    ...SITES.map((s) => siteTable(ctx, verdicts.get(s)!)),
    repeatTable(ctx),
    q3.table,
    comboTable(ctx, verdicts),
    ...ablationTable(ctx), renderingTable(ctx), formatTable(ctx),
    routeTable(ctx), stabilityTable(ctx), injectionTable(ctx), piiTable(ctx, extra.egress),
    ...timingTables(ctx), costTable(ctx, extra.crosscheck), sliceTable(ctx),
  ].sort((a, b) => a.section - b.section);
  const verdictCells = SITES.flatMap((s) => verdicts.get(s)!.evals.map((e) => ({ anchor: `site-${s}`, cell: `${s}/${e.cand.id}`, actedGroups: e.prec?.groups ?? null })));
  return { tables, missing: [...ctx.missing].sort(), verdictCells };
}
