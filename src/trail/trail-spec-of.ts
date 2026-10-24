import type { TrailBook } from './trail-book';
import type { TrailArm, TrailRow, TrailSpec } from './trail-spec';

/** A row read on another origin, or on none known, goes without its element's name. */
function nameless(row: TrailRow): TrailRow {
  if (row.target === undefined || row.target.name === undefined) return row;
  return { ...row, target: { ref: row.target.ref, role: row.target.role } };
}

/**
 * The spec for one draw on `book`'s page: every row this process made there (the page merges by id, so a row sent
 * again only updates itself), each with its element's name only when it was read on the origin the page was last
 * read on, and that origin, which the page checks against its own before it draws anything. At most 12 rows of
 * bounded fields (names 80 characters), so a spec stays a few KB, far below a socket frame.
 */
export function specOf(book: TrailBook, now: number, arm?: TrailArm): TrailSpec {
  const rows = book.rows.map(({ row, origin }) => (origin !== null && origin === book.origin ? row : nameless(row)));
  const spec: TrailSpec = { v: 1, now, origin: book.origin, rows };
  if (arm !== undefined) spec.arm = arm;
  return spec;
}
