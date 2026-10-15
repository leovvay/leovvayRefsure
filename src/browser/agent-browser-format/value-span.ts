import type { SnapshotLine } from './snapshot-line-shape';
import { squeeze } from './spacing';

/** How many lines past a value refsure looks for the value's end. A longer value keeps only its first line. */
const SPAN_MAX = 2000;

/**
 * Whether the StaticText under the child line `start` repeats `text` (the value, squeezed): every non-empty
 * StaticText name is found in order, and the last one ends the value. Text hidden from the tree but kept in the
 * value (an `aria-hidden` span) may sit between them.
 */
function echoes(lines: readonly (SnapshotLine | null)[], start: number, text: string): boolean {
  const minIndent = lines[start]!.indent;
  let from = 0;
  let before = 0;
  let last = '';
  for (let j = start; j < lines.length; j += 1) {
    const line = lines[j];
    if (line === null || line === undefined || line.indent < minIndent) break;
    if (line.role !== 'StaticText') continue;
    const piece = squeeze(line.name);
    if (piece === '') continue;
    const found = text.indexOf(piece, from);
    if (found === -1) return false;
    before = from;
    from = found + piece.length;
    last = piece;
  }
  return last !== '' && text.endsWith(last) && text.length - last.length >= before;
}

/**
 * How many raw lines after line `at` belong to its value. agent-browser prints a value raw after `: `, so a
 * multi-line value (a textarea, an editable region) runs on over the next lines, and those lines can look like
 * nodes, refs included. The field's StaticText children repeat the value with every name JSON-quoted, so the
 * value ends right before the child line whose StaticText ends it.
 * - The last such child wins: run-on text shaped like an echo can only stop the value early, and is ignored.
 * - Nothing is searched past `bound`, a line agent-browser surely printed (see `nextAnchors`).
 * 0 when no child repeats the value: a one-line value, or one whose text the tree does not repeat.
 */
export function valueSpan(lines: readonly (SnapshotLine | null)[], raw: readonly string[], at: number, bound: number): number {
  const head = lines[at];
  if (head === null || head === undefined || head.value === null) return 0;
  const childIndent = head.indent + 2;
  const end = Math.min(bound + 1, lines.length, at + 2 + SPAN_MAX);
  let text = squeeze(head.value);
  let span = 0;
  for (let start = at + 2; start < end; start += 1) {
    text += squeeze(raw[start - 1] ?? '');
    const line = lines[start];
    if (line === null || line === undefined || line.indent !== childIndent) continue;
    if (echoes(lines, start, text)) span = start - at - 1;
  }
  return span;
}
