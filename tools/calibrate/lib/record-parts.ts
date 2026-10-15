import type { HeldRecord } from './held-record';
import type { RunRow } from './run-row';
import type { ShippedEntry } from './shipped-entry';
import type { SiteFit } from './site-fit';

/*
  The parts an entry's provenance and a held or native reading share, so both record kinds describe one fit the
  same way.
*/

/** An entry already shipped, as a later record names it: its rows, sets, calls and date. */
export type EntrySummary = NonNullable<HeldRecord['replaced']>;

/** Each fitted edge's value, before the max with its starting row; `null` where the fit fell back. */
export function fittedOf(fit: SiteFit): Record<string, number | null> {
  const fitted: Record<string, number | null> = {};
  for (const [name, edge] of Object.entries(fit.fits)) fitted[name] = edge.value;
  return fitted;
}

/** Distinct salts among the rows: shuffle orders, or repeats for an unshuffled site. */
export function ordersOf(rows: readonly RunRow[]): number {
  return new Set(rows.map((row) => row.salt)).size;
}

export function summaryOf(entry: ShippedEntry): EntrySummary {
  return { threshold: entry.threshold, set: entry.provenance.set, n: entry.n, date: entry.date };
}
