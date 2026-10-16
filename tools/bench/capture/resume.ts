import { existsSync, writeFileSync } from 'node:fs';
import { readJsonl } from '../../calibrate/lib/jsonl';
import type { CaptureItem } from './capture-item';
import { idFor } from './emit';

/*
  `capture --resume`: keep `<out>` and `<out>.rows.jsonl`, skip every item an earlier run already wrote, and capture
  again the items it dropped as `capture_error` (those rows are removed first, so no item is written twice). Parity
  already run on an item counts toward its site's `--parity N`.
*/

export const CAPTURE_ERROR = 'capture_error';

type Line = { id?: unknown; rule?: unknown };

/** Every id one item can write: its own and, for both mask modes, its mode id. */
export function idsOf(item: CaptureItem): string[] {
  return [item.id, idFor(item, true), idFor(item, false)];
}

export function resumeFrom(outPath: string, items: readonly CaptureItem[]): { todo: CaptureItem[]; done: number; retried: number; checked: Record<string, number> } {
  const rowsPath = `${outPath}.rows.jsonl`;
  const rows = readJsonl<Line>(rowsPath, { optional: true });
  const kept = rows.filter((r) => !String(r.rule ?? '').startsWith(CAPTURE_ERROR));
  if (existsSync(rowsPath)) writeFileSync(rowsPath, kept.map((r) => `${JSON.stringify(r)}\n`).join(''));
  const written = new Set([...readJsonl<Line>(outPath, { optional: true }), ...kept].map((r) => String(r.id)));
  const parityIds = new Set(readJsonl<Line>(`${outPath}.parity.jsonl`, { optional: true }).map((r) => String(r.id)));
  const checked: Record<string, number> = {};
  const todo: CaptureItem[] = [];
  for (const item of items) {
    const ids = idsOf(item);
    if (ids.some((id) => parityIds.has(id))) checked[item.site] = (checked[item.site] ?? 0) + 1;
    if (!ids.some((id) => written.has(id))) todo.push(item);
  }
  return { todo, done: items.length - todo.length, retried: rows.length - kept.length, checked };
}
