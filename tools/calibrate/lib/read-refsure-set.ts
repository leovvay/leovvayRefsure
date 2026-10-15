import type { GoldRef } from './gold-ref';
import type { NativeItem } from './native-item';
import { parseV1Line } from './v1-line';

/*
  The sets written for refsure (`tools/calibrate/sets/*.jsonl`): one page per item under the set's own directory.
  Gold is `gold_ref` (role, name, ordinal, and the path when the set gives one), `none`, or a key; `alt` are line
  indices into the lines the set was authored against, read back as role, name and path.
*/

type Row = Record<string, unknown> & { id: string; page: string; site: string; gold: string };

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

function elementOf(ref: unknown): GoldRef {
  const r = (ref ?? {}) as Record<string, unknown>;
  const element: GoldRef = {
    kind: 'element', role: str(r.role), name: str(r.name), ordinal: typeof r.ordinal === 'number' ? r.ordinal : 1,
  };
  if (typeof r.path === 'string') element.path = r.path;
  return element;
}

function altOf(row: Row, lines: readonly string[]): GoldRef[] {
  const alt = Array.isArray(row.alt) ? row.alt : [];
  return alt.map((index) => {
    if (String(index) === 'none') return { kind: 'none' } as const;
    const parsed = parseV1Line(lines[Number(index)] ?? '');
    if (parsed === null) throw new Error(`${row.id}: alt ${String(index)} names no line of the set`);
    return { kind: 'element', role: parsed.role, name: parsed.name, ordinal: 1, path: parsed.path } as const;
  });
}

function goldOf(row: Row): GoldRef {
  if (row.gold === 'none') return { kind: 'none' };
  return row.gold_ref === undefined ? { kind: 'key', value: String(row.gold) } : elementOf(row.gold_ref);
}

/** One row of a refsure set as the Orca-native replay reads it. */
export function readRefsureRow(row: Row, set: string): NativeItem {
  const input = (row.input ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(input.lines) ? (input.lines as string[]) : [];
  const injected = row.injected === true ? '+injected' : '';
  const base = {
    id: row.id, base: str(row.base, row.id), set, page: row.page, at: `/${row.page}${str(row.query)}`,
    lang: str(row.lang, 'en'), source: str(row.source, 'synthetic'), condition: `${str(row.condition)}${injected}`,
    risk: typeof row.risk === 'string' ? row.risk : null, gold: goldOf(row), alt: altOf(row, lines),
  };
  switch (row.site) {
    case 'find':
      return { ...base, site: 'find', intent: str(input.intent), within: typeof row.within === 'string' ? row.within : null };
    case 'dismiss':
      return { ...base, site: 'dismiss' };
    case 'presence':
      return { ...base, site: 'presence', expectation: str(row.expectation) };
    case 'page-state': {
      const modes = Array.isArray(row.masks) ? row.masks.map((mode) => mode === 'on') : [true];
      return { ...base, site: 'page-state', expect: str(row.expect), masks: modes };
    }
    default:
      throw new Error(`${row.id}: site ${row.site} has no Orca-native replay`);
  }
}
