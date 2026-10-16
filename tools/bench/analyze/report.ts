import { SITES } from './readings';
import type { Site } from './readings';
import { injectionTable } from './injection';
import { repeatTable } from './repeats';
import { spendTable } from './spend-table';
import {
  Ctx, ablationTable, comboTable, costTable, formatTable, ownerTables, piiTable, q3Table, renderingTable, routeTable, siteTable,
  siteVerdict, sliceTable, stabilityTable, timingTables,
} from './verdict';
import type { Inputs, Report, SiteVerdict, Table } from './verdict';
import type { CrossCheck } from '../spend';

/**
 * The tables that print a three-way reading (3.1, 5.5, 5.6) or a reading built on one, read through `ctx`: rule M
 * and the owner actions, the pixel slice, Q5, the owner answers and Q17 (`owner`), Q1, the site tables, Q3 and Q2.
 * analyze/t17.ts reads the same tables under the second reading of T17.
 */
export function readingTables(ctx: Ctx): { verdicts: Map<Site, SiteVerdict>; owner: Table[]; q1: Table; sites: Table[]; q3: Table; combos: Table } {
  const verdicts = new Map<Site, SiteVerdict>(SITES.map((s) => [s, siteVerdict(ctx, s)]));
  const q3 = q3Table(ctx);
  const owner = ownerTables(ctx, verdicts, q3.d3);
  const q1: Table = { anchor: 'q1', section: 2, title: 'Default arm per site (Q1, 5.5)', columns: ['site', 'verdict', 'candidates (status)', 'notes'],
    rows: SITES.map((s) => { const v = verdicts.get(s)!; return [s, v.text, v.evals.map((e) => `${e.cand.id}${e.cand.incumbent ? '*' : ''}: ${e.status}`).join('; '), v.notes.join('; ') || null]; }),
    notes: ['* = incumbent. Candidates are the routes refsure takes today; jev_or, research arms and bench_combinator cells are printed beside in each site table.'] };
  return { verdicts, owner: owner.tables, q1, sites: SITES.map((s) => siteTable(ctx, verdicts.get(s)!)), q3: q3.table, combos: comboTable(ctx, verdicts) };
}

/** Everything section 5 and 4.4 print, in 9.1 order, plus the inputs that were missing. */
export function analyze(i: Inputs, extra: { egress: { checked: number; hits: string[]; unlisted?: string[] } | null; crosscheck: Partial<CrossCheck> | null }): Report {
  const ctx = new Ctx(i);
  const read = readingTables(ctx);
  const tables: Table[] = [
    ...read.owner, read.q1, ...read.sites,
    repeatTable(ctx),
    read.q3,
    read.combos,
    ...ablationTable(ctx), renderingTable(ctx), formatTable(ctx),
    routeTable(ctx), stabilityTable(ctx), injectionTable(ctx), piiTable(ctx, extra.egress),
    ...timingTables(ctx), costTable(ctx, extra.crosscheck), spendTable(extra.crosscheck, (what) => ctx.miss(what)), sliceTable(ctx),
  ].sort((a, b) => a.section - b.section);
  const verdictCells = SITES.flatMap((s) => read.verdicts.get(s)!.evals.map((e) => ({ anchor: `site-${s}`, cell: `${s}/${e.cand.id}`, actedGroups: e.prec?.groups ?? null })));
  return { tables, missing: [...ctx.missing].sort(), verdictCells };
}
