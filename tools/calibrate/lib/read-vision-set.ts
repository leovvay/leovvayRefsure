import { fold } from '../../../src/page-model';
import { str } from './coerce';
import { type Descriptor, nameOf, parseDescriptor, pathOf } from './descriptor';
import type { GoldRef } from './gold-ref';
import type { NativeItem } from './native-item';

/*
  Frozen benchmark items that carry their stored page (`vision.page`, `vision.pages`, or the `Page:` path in the
  note). Their gold is an index into descriptor lines; it becomes role, name and ordinal: the ordinal counts the
  descriptors of the same role and name in the list's own order, which is page order (a box can sit above an
  earlier element: a dialog drawn over the page). The page is served at the path it was recorded at.
*/

type Row = Record<string, unknown> & { id: string; task: string; gold: unknown; request: Record<string, unknown> };

const SITES: Readonly<Record<string, NativeItem['site']>> = {
  browser_locate: 'locate', browser_dismiss: 'dismiss', browser_page_state: 'page-state', browser_presence: 'presence',
};
const EXPECTED = /^It is the intended page — (.*) — though layout or wording may differ from what was recorded\.$/su;
const PAGE_IN_NOTE = /vision-pages\/[A-Za-z0-9._-]+\.html/;

/**
 * The descriptor at `index` of an item's parsed list as role, name and its ordinal among same-role, same-name
 * descriptors in list order; `hint` is its v1 path.
 */
export function descriptorRef(parsed: readonly (Descriptor | null)[], index: number): GoldRef | null {
  const d = parsed[index] ?? null;
  if (d === null) return null;
  const name = nameOf(d);
  const same = parsed.map((x, at) => ({ at, d: x }))
    .filter((x) => x.d !== null && x.d.role === d.role && fold(nameOf(x.d)) === fold(name));
  return {
    kind: 'element', role: d.role, name, ordinal: same.findIndex((x) => x.at === index) + 1, of: same.length,
    hint: pathOf(d),
  };
}

function pagesOf(row: Row): { page: string | null; recording: string | null } {
  const vision = (row.vision ?? {}) as { page?: unknown; pages?: { replay?: unknown; recording?: unknown } };
  const page = str(vision.page) || str(vision.pages?.replay) || (PAGE_IN_NOTE.exec(str(row.note))?.[0] ?? '');
  return { page: page === '' ? null : page, recording: str(vision.pages?.recording) || null };
}

function servedAt(pageUrl: string, page: string): string {
  try {
    const url = new URL(pageUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return `/${page}`;
  }
}

/** One frozen item as the Orca-native replay reads it; `null` (with why) when it has no stored page or site. */
export function readVisionRow(row: Row, set: string): NativeItem | { skip: string } {
  const site = SITES[row.task];
  if (site === undefined) return { skip: `task ${row.task} has no Orca-native replay` };
  const { page, recording } = pagesOf(row);
  if (page === null) return { skip: 'no stored page' };
  const r = row.request;
  const parsed = (Array.isArray(r.candidates) ? (r.candidates as unknown[]) : []).map((line) => parseDescriptor(str(line)));
  const keyed = (value: unknown): GoldRef | null => {
    if (String(value) === 'none') return { kind: 'none' };
    if (site === 'page-state' || site === 'presence') return { kind: 'key', value: String(value) };
    return descriptorRef(parsed, Number(value));
  };
  const gold = keyed(row.gold);
  if (gold === null) return { skip: 'gold names no parsable descriptor' };
  const alt = (Array.isArray(row.alt) ? row.alt : []).map(keyed).filter((ref): ref is GoldRef => ref !== null);
  const base = {
    id: row.id, base: str(row.base) || row.id, set, page, at: servedAt(str(r.pageUrl), page), lang: str(row.lang) || 'en',
    source: str(row.source), condition: str(row.condition), risk: str(r.risk) || null, gold, alt,
    visualOnly: (row.vision as { visual_only?: unknown } | undefined)?.visual_only === true,
  };
  switch (site) {
    case 'dismiss':
      return { ...base, site };
    case 'presence':
      return { ...base, site, expectation: str(r.expectation) };
    case 'page-state': {
      const expected = str((r.states as Record<string, unknown> | undefined)?.expected);
      const expect = EXPECTED.exec(expected)?.[1];
      if (expect === undefined) return { skip: 'its expected state is not the research wording' };
      return { ...base, site, expect, masks: [true] };
    }
    case 'locate': {
      const recorded = parseDescriptor(str(r.recorded));
      if (recording === null || recorded === null) return { skip: 'no recorded page or recorded descriptor' };
      const recordedRef: GoldRef = { kind: 'element', role: recorded.role, name: nameOf(recorded), ordinal: 1, hint: pathOf(recorded) };
      return { ...base, site, intent: str(r.intent), recordedPage: recording, recordedRef };
    }
    default:
      return { skip: `site ${site} is not replayed` };
  }
}
