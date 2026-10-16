import type { CalibrationEntry } from '../../../src/questions';
import { pageKey } from './item-page';
import type { MasksReading } from './masks-reading';
import type { RunRow } from './run-row';
import { wilsonLow } from './wilson';

/*
  The PII masks reading (spec §7.3). A page asked with masks on and off is one page twice, so the modes are compared
  on those pages only, each at the rows refsure acts on. Calls on a page asked in one mode alone (every other set,
  where masks are on by default) are left out.
*/

type Rows = CalibrationEntry['threshold'];

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Whether refsure acts on a call at these rows: a Choice pick other than `none` at its risk's row, a Noul's yes edge. */
function actsAt(rows: Rows, noul: boolean): (row: RunRow) => boolean {
  if (noul) {
    const yes = (rows as { yesAtLeast: number }).yesAtLeast;
    return (row) => (row.noul ?? row.confidence!) >= yes;
  }
  if (typeof rows === 'number') return (row) => row.choice !== 'none' && row.confidence! >= rows;
  const perRisk = rows as Readonly<Record<string, number>>;
  // A call without a risk label reads the strictest row, as `locate` without `--risk` does.
  const strictest = Math.max(...Object.values(perRisk));
  return (row) => row.choice !== 'none' && row.confidence! >= (row.risk !== null && row.risk in perRisk ? perRisk[row.risk]! : strictest);
}

/** The answer given most often; `null` on a tie, which agrees with nothing. */
function topPick(rows: readonly RunRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.choice!, (counts.get(row.choice!) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return ranked.length > 1 && ranked[0]![1] === ranked[1]![1] ? null : ranked[0]?.[0] ?? null;
}

function modeOf(calls: readonly RunRow[], acts: (row: RunRow) => boolean): MasksReading['on'] {
  const acted = calls.filter(acts);
  const correct = acted.filter((row) => row.correct === true).length;
  return {
    calls: calls.length, right: calls.filter((row) => row.correct === true).length, acted: acted.length, correct,
    coverage: round4(acted.length / calls.length), precision: acted.length === 0 ? null : round4(correct / acted.length),
    wilsonLow: wilsonLow(correct, acted.length),
  };
}

/**
 * Masks on against off over the answered calls of one site, at `rows`; `undefined` when no page was asked in both
 * modes. `usable` holds the calls the fit read (answered, on the declared wording).
 */
export function maskModes(
  usable: readonly RunRow[], rows: Rows, rowsFrom: MasksReading['rowsFrom'], noul: boolean,
): MasksReading | undefined {
  const byPage = new Map<string, { on: RunRow[]; off: RunRow[] }>();
  for (const row of usable) {
    if (row.masks === undefined) continue;
    const page = byPage.get(pageKey(row)) ?? { on: [], off: [] };
    (row.masks ? page.on : page.off).push(row);
    byPage.set(pageKey(row), page);
  }
  const paired = [...byPage.values()].filter((page) => page.on.length > 0 && page.off.length > 0);
  if (paired.length === 0) return undefined;
  const on = paired.flatMap((page) => page.on);
  const off = paired.flatMap((page) => page.off);
  const acts = actsAt(rows, noul);
  return {
    sets: [...new Set([...on, ...off].map((row) => row.set ?? ''))].sort(), pages: paired.length,
    agree: paired.filter((page) => topPick(page.on) !== null && topPick(page.on) === topPick(page.off)).length,
    rows, rowsFrom, orders: new Set([...on, ...off].map((row) => row.salt)).size,
    on: modeOf(on, acts), off: modeOf(off, acts),
  };
}
