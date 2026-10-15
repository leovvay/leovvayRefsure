import type { Ref } from '../ax-tree';

/** One printed snapshot line, read but not yet placed in the tree. */
export interface SnapshotLine {
  /** Leading spaces; one level is two. */
  indent: number;
  role: string;
  /** JSON-unescaped; empty when the line has no name. */
  name: string;
  ref: Ref | null;
  /** `level=1` → `'1'`; a bare `selected` → `true`; the cursor part (`editable [contenteditable]`) as flags. */
  attrs: Record<string, string | true>;
  /** The text after `: `, raw; a multi-line value runs on over the lines below it. */
  value: string | null;
}
