import type { SnapshotBody } from './snapshot-body-shape';
import type { SnapshotLine } from './snapshot-line-shape';
import { squeeze } from './spacing';

/**
 * Whether the reply's `refs` map vouches for the ref on `line`: the ref is in the map, and the map's role and
 * name agree with the line (the name up to spacing, which Orca's text loses). A value's run-on text can print
 * any `[ref=eN]`; it cannot add to the map. With no map (a bare snapshot string) every ref is taken as given.
 */
export function refVouched(line: SnapshotLine, refs: SnapshotBody['refs']): boolean {
  if (line.ref === null || refs === null) return true;
  const entry = refs.get(line.ref);
  if (entry === undefined) return false;
  if (entry.role !== null && entry.role !== line.role) return false;
  // An empty map name says nothing: agent-browser may print an unnamed element's text in its place.
  return entry.name === null || entry.name === '' || squeeze(entry.name) === squeeze(line.name);
}

/** How often each ref is printed over the lines `keep` selects. A ref printed twice is void everywhere. */
export function refCounts(lines: readonly (SnapshotLine | null)[], keep: (j: number) => boolean): Map<string, number> {
  const counts = new Map<string, number>();
  lines.forEach((line, j) => {
    if (line?.ref == null || !keep(j)) return;
    counts.set(line.ref, (counts.get(line.ref) ?? 0) + 1);
  });
  return counts;
}

/**
 * For each line, the index of the first later line that is surely printed by agent-browser itself: its ref is
 * vouched for and printed once. A value's run-on text never reaches past it. `lines.length` when none follows.
 */
export function nextAnchors(lines: readonly (SnapshotLine | null)[], refs: SnapshotBody['refs']): number[] {
  const counts = refCounts(lines, () => true);
  const out = new Array<number>(lines.length);
  let next = lines.length;
  for (let j = lines.length - 1; j >= 0; j -= 1) {
    out[j] = next;
    const line = lines[j];
    if (line?.ref != null && counts.get(line.ref) === 1 && refVouched(line, refs)) next = j;
  }
  return out;
}
