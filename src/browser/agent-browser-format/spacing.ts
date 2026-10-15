import type { Ref } from '../ax-tree';
import type { SnapshotBody } from './snapshot-body-shape';

// Whitespace (NBSP included), plus the zero-width characters `norm` also reads as spaces.
const SPACING = /[\s​-‍⁠﻿]+/gu;

/** The text with every space and zero-width character removed: what survives Orca dropping a no-break space. */
export function squeeze(text: string): string {
  return text.replace(SPACING, '');
}

/**
 * Orca's snapshot text drops a no-break space from names (`Delete&nbsp;account` reads `Deleteaccount`), which
 * would hide the word "delete" from the risk lexicons; its `refs` map keeps it. The `refs` name is taken only
 * when the two differ in spacing alone, so the text stays the source of every character.
 */
export function withRefSpacing(textName: string, ref: Ref | null, refs: SnapshotBody['refs']): string {
  const refName = ref === null ? null : (refs?.get(ref)?.name ?? null);
  if (refName === null || refName === textName) return textName;
  return squeeze(refName) === squeeze(textName) ? refName : textName;
}
