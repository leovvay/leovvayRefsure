import { FIRST_READING, SITES } from './readings';
import type { Reading } from './readings';
import { readingTables } from './report';
import { Ctx } from './verdict';
import type { Cell, Inputs, Table } from './verdict';

/*
  T17 (8): "where two readings remain, both are computed and shown, neither chosen after results". Two rule texts
  admit two readings, and every other table prints the first (readings.ts `Reading`):
  - 3.1's rho pool, "pooled over every arm and set of that site" (clusters (arm, set, group), A6 item 1): every arm
    and combo of the site, or the single arms of section 2 only;
  - X7, "when sets are pooled, rows with an equal approved-request digest at p0/r1 are counted once": within one set
    and across sets, or across sets only.
  Under each second reading, the tables that print a three-way reading or one built on it (report.ts
  `readingTables`) are read again and compared with the printed ones, cell by cell and note by note. A cell's reading
  word is its text with every number taken out: each cell whose word changes is listed; per site, the cells whose
  word stays while a printed bound or n_eff moves are counted, with the largest move of a deff lower or danger upper
  bound. Only the second readings are computed here; nothing printed elsewhere changes.
*/

/** How a compared column is read: a reading word, a bound (and which), or an n_eff. */
type Kind = 'reading' | 'deff' | 'danger' | 'neff';

/**
 * Each compared table: where its rows name a site, how a row is named, its compared columns, and the count of items a
 * row reads (`items`: its column and the cell it names), whose moves the notes list.
 */
interface Spec {
  site: (row: Cell[]) => string | null; name: (row: Cell[]) => string; columns: Readonly<Record<string, Kind>>;
  items?: { column: string; cell: (row: Cell[]) => string };
}

const OWNER_COLUMNS: Readonly<Record<string, Kind>> = { reading: 'reading', 'precision deff lower': 'deff', 'danger upper': 'danger' };

const SPECS: Readonly<Record<string, Spec>> = {
  owner: { site: (r) => String(r[1]), name: (r) => `${r[0]} | ${r[1]}`, columns: OWNER_COLUMNS },
  pixel: { site: (r) => String(r[0]), name: (r) => `${r[0]} | ${r[1]} | ${r[2]}`, columns: { 'exact upper': 'danger' },
    items: { column: 'danger-eligible', cell: (r) => `${r[0]} ${r[2]}` } },
  q5: { site: (r) => String(r[1]), name: (r) => `${r[0]} | ${r[1]} | ${String(r[10]).split(':')[0]}`, columns: OWNER_COLUMNS },
  answers: { site: (r) => SITES.find((s) => String(r[0]).includes(` ${s} `)) ?? null, name: (r) => String(r[0]),
    columns: { reading: 'reading', 'blocking reasons / note': 'reading' } },
  q1: { site: (r) => String(r[0]), name: (r) => String(r[0]), columns: { verdict: 'reading', 'candidates (status)': 'reading', notes: 'reading' } },
  site: { site: () => null, name: (r) => `${r[0]} | ${r[1]}`, columns: {
    'deff lower': 'deff', 'rule at P*': 'reading', 'at 0.98': 'reading', 'at 0.95': 'reading', 'danger upper': 'danger',
    'R2 cov .95': 'reading', 'R2 cov .98': 'reading', 'R2 cov .99': 'reading',
  }, items: { column: 'items', cell: (r) => String(r[1]) } },
  q3: { site: (r) => String(r[0]), name: (r) => `${r[0]} | ${r[1]}`, columns: { 'deff lower 0.99': 'deff', 'deff lower 0.95': 'deff', n_eff: 'neff', verdict: 'reading' } },
  combos: { site: (r) => String(r[0]), name: (r) => `${r[0]} | ${r[1]} | ${r[2]}`, columns: { 'OpenAI-branch acts': 'reading', verdict: 'reading' } },
};

const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;

/** A cell's reading word: its text with every number taken out. */
function word(v: Cell): string {
  return v === null ? '-' : String(v).replace(NUMBER, '#');
}

/** The bound a cell prints (its first number), or null. */
function boundOf(v: Cell): number | null {
  if (typeof v === 'number') return v;
  const m = v === null ? null : String(v).match(NUMBER);
  return m === null ? null : Number(m[0]);
}

/** The n_eff values a reading cell quotes, or the n_eff column's value. */
function nEffOf(v: Cell, kind: Kind): string {
  return kind === 'neff' ? String(v) : [...String(v).matchAll(/n_eff (\d+)/g)].map((m) => m[1]).join(',');
}

interface Change { site: string; anchor: string; row: string; column: string; first: Cell; second: Cell }
interface Move { site: string; anchor: string; row: string; column: string; first: number | null; second: number | null; bound: boolean }

/** One printed table against the same table under the second reading. */
function compare(first: Table, second: Table, out: { changes: Change[]; moves: Move[]; items: Change[] }): void {
  const spec = SPECS[first.anchor.startsWith('site-') ? 'site' : first.anchor]!;
  const tableSite = first.anchor.startsWith('site-') ? first.anchor.slice('site-'.length) : null;
  const siteOf = (row: Cell[]) => tableSite ?? spec.site(row) ?? 'every site';
  for (let i = 0; i < Math.max(first.rows.length, second.rows.length); i += 1) {
    const a = first.rows[i];
    const b = second.rows[i];
    if (a === undefined || b === undefined || spec.name(a) !== spec.name(b)) {
      out.changes.push({ site: siteOf(a ?? b!), anchor: first.anchor, row: spec.name(a ?? b!), column: '(row)', first: a ? spec.name(a) : null, second: b ? spec.name(b) : null });
      continue;
    }
    const base = { site: siteOf(a), anchor: first.anchor, row: spec.name(a) };
    for (const [column, kind] of Object.entries(spec.columns)) {
      const j = first.columns.indexOf(column);
      const [x, y] = [a[j] ?? null, b[j] ?? null];
      if (x === y) continue;
      if (word(x) !== word(y)) { out.changes.push({ ...base, column, first: x, second: y }); continue; }
      const bound = kind === 'deff' || kind === 'danger';
      if ((bound && boundOf(x) !== boundOf(y)) || nEffOf(x, kind) !== nEffOf(y, kind)) {
        out.moves.push({ ...base, column, first: bound ? boundOf(x) : null, second: bound ? boundOf(y) : null, bound });
      }
    }
    const k = spec.items === undefined ? -1 : first.columns.indexOf(spec.items.column);
    if (spec.items !== undefined && a[k] !== b[k]) out.items.push({ ...base, row: spec.items.cell(a), column: spec.items.column, first: a[k] ?? null, second: b[k] ?? null });
  }
  // Notes carry readings too (the site verdict, `fragile`, D1's scope, D3): compared as one block when any word moves.
  if (first.notes.map(word).join('\n') !== second.notes.map(word).join('\n')) {
    const differ = (xs: string[], ys: string[]) => xs.filter((n) => !ys.map(word).includes(word(n))).join(' / ') || null;
    out.changes.push({ site: tableSite ?? 'every site', anchor: first.anchor, row: '(notes)', column: 'note',
      first: differ(first.notes, second.notes), second: differ(second.notes, first.notes) });
  }
}

/** The tables of `readingTables` in the order they print. */
function tablesOf(ctx: Ctx): Table[] {
  const r = readingTables(ctx);
  return [...r.owner, r.q1, ...r.sites, r.q3, r.combos];
}

const COLUMNS = ['second reading of', 'site', 'kind', 'table', 'row', 'column', 'printed (first reading)', 'second reading'];

/**
 * T17: the printed reading tables (`printed`, by anchor) against each second reading, recomputed from `i`. The R2
 * coverage draws are shared with the printed run (Ctx `r2Draws`): they read no rho, and a cell whose units differ
 * under X7 draws its own.
 */
export function t17Table(i: Inputs, printed: readonly Table[]): Table {
  const byAnchor = new Map(printed.map((t) => [t.anchor, t]));
  const singleArms = [...new Set(i.units.map((u) => u.arm))].sort();
  const seconds: { label: string; reading: Reading }[] = [
    { label: `3.1 rho pool: single arms only (${singleArms.join(', ')})`, reading: { ...FIRST_READING, rhoPool: 'single arms' } },
    { label: 'X7: equal digests counted once across sets only', reading: { ...FIRST_READING, x7: 'across sets only' } },
  ];
  const rows: Cell[][] = [];
  const notes: string[] = [];
  for (const { label, reading } of seconds) {
    const out = { changes: [] as Change[], moves: [] as Move[], items: [] as Change[] };
    for (const second of tablesOf(new Ctx(i, reading))) {
      const first = byAnchor.get(second.anchor);
      if (first === undefined) throw new Error(`t17: the printed tables have no #${second.anchor}`);
      compare(first, second, out);
    }
    for (const site of [...SITES, 'every site']) {
      const changes = out.changes.filter((x) => x.site === site);
      const moves = out.moves.filter((m) => m.site === site);
      if (site === 'every site' && changes.length === 0 && moves.length === 0) continue;
      for (const c of changes) rows.push([label, site, 'reading word changes', c.anchor, c.row, c.column, c.first, c.second]);
      // The largest move of a deff lower or danger upper bound, whether or not its cell's word changed.
      const top = out.moves.concat(out.changes.map((c) => ({ ...c, first: boundOf(c.first), second: boundOf(c.second), bound: /lower|upper/.test(c.column) })))
        .filter((m) => m.site === site && m.bound && m.first !== null && m.second !== null && m.first !== m.second)
        .sort((x, y) => Math.abs(y.second! - y.first!) - Math.abs(x.second! - x.first!))[0];
      const delta = top ? Number((top.second! - top.first!).toPrecision(4)) : 0;
      rows.push([label, site, `bound or n_eff moved, word unchanged: ${moves.length} cells; largest deff lower or danger upper move`,
        top?.anchor ?? null, top?.row ?? null, top?.column ?? null, top?.first ?? null, top ? `${top.second} (${delta > 0 ? '+' : ''}${delta})` : null]);
    }
    if (out.items.length > 0) {
      const counts = new Map<string, number>();
      for (const c of out.items) {
        const k = `${c.anchor} ${c.row}: ${c.first} -> ${c.second} ${c.column}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      notes.push(`${label}: items read change in ${[...counts.entries()].map(([k, n]) => `${k} (${n} rows)`).join('; ')}.`);
    }
  }
  notes.unshift(
    'The printed cells read the first reading, this table shows the second, and neither is chosen (T17).',
    '3.1 rho pool: first, every arm and combo of the site; second, the single arms of section 2 only (clusters (arm, set, group) in both, A6 item 1). X7: first, an equal p0/r1 digest is counted once within one set and across the pooled sets; second, across sets only.',
    'Compared: #owner, #pixel, #q5, #answers, #q1, the seven site tables, #q3 and #combos, every reading, bound and n_eff column and their notes. A reading word is the cell text with every number taken out; the pixel slice\'s exact upper counts as a danger upper bound.',
  );
  return { anchor: 't17', section: 10, title: 'T17: readings under the other reading of 3.1\'s rho pool and of X7', columns: COLUMNS, rows, notes };
}
