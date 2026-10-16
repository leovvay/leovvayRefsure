import { str } from '../../calibrate/lib/coerce';
import { parseV1Line } from '../../calibrate/lib/v1-line';
import type { CaptureItem, CaptureSite, ElementRef, Side } from './capture-item';
import { elementRef, optionLabelOf, truthsOf } from './read-truth';

/*
  An authored set row (tools/bench/sets/n*.jsonl) as the capture reads it. `input` there is the author's preview
  (`input_provisional`); only `intent`, `expectation` and `expect` are taken from it, everything else is rebuilt
  from the live page. A page is served at `at` (its recorded path and query), else at the path of a provisional
  `pageUrl` (presence: an `example.test` stand-in keeps only its path), else at `/<page><query>`.
*/

type Row = Record<string, unknown>;
const SITES: ReadonlySet<string> = new Set(['locate', 'find', 'dismiss', 'presence', 'page-state', 'outcome', 'option-map']);
const USED = new Set(['id', 'page', 'recorded_page', 'site', 'lang', 'source', 'condition', 'base', 'risk', 'input',
  'input_provisional', 'recorded', 'recorded_ref', 'gold', 'gold_ref', 'alt', 'alt_ref', 'gold_masks_on', 'why',
  'before', 'after', 'acted_element', 'acted_selector', 'acted_name', 'at', 'expectation', 'expect', 'states', 'masks',
  'query', 'within', 'intent', 'visual_only', 'field', 'field_ref', 'want', 'options', 'open', 'evidence', 'absent',
  'danger_eligible']);

function pathOfUrl(url: string): string | null {
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function sideOf(value: unknown, fallbackAt: (page: string) => string): Side | null {
  if (typeof value === 'string' && value !== '') return { page: value, at: fallbackAt(value) };
  if (value === null || typeof value !== 'object') return null;
  const v = value as Row;
  return str(v.page) === '' ? null : { page: str(v.page), at: str(v.at) || fallbackAt(str(v.page)) };
}

/** The acted element of an outcome row: N5 `{selector, role, name, ordinal}`, N9 a v1 line plus `acted_*`. */
function actedOf(row: Row): { ref: ElementRef; selector: string | null } | null {
  const given = elementRef(row.acted_element);
  if (given !== null) return { ref: given, selector: str((row.acted_element as Row).selector) || null };
  const line = parseV1Line(str(row.acted_element));
  if (line === null) return null;
  return { ref: { kind: 'element', role: line.role, name: str(row.acted_name) || line.name, ordinal: 1 }, selector: str(row.acted_selector) || null };
}

export function readCaptureRow(row: Row, set: string): CaptureItem | { skip: string } {
  const id = str(row.id);
  const site = str(row.site);
  if (!SITES.has(site)) return { skip: `site ${site} is not captured` };
  const input = (row.input ?? {}) as Row;
  const query = str(row.query);
  const plain = (page: string): string => `/${page}${query}`;
  const provisional = typeof input.pageUrl === 'string' ? pathOfUrl(input.pageUrl) : null;
  const page = sideOf({ page: row.page, at: str(row.at) || provisional || plain(str(row.page)) }, plain);
  if (page === null) return { skip: 'no page' };
  const truths = site === 'option-map' ? null : truthsOf(row);
  if (truths !== null && 'skip' in truths) return truths;
  const masks = Array.isArray(row.masks) ? row.masks.map((m) => m === 'on' || m === true) : [true];
  const meta = Object.fromEntries(Object.entries(row).filter(([key]) => !USED.has(key)));
  const none = { ref: { kind: 'none' as const }, selector: null, name: null };
  const item: CaptureItem = {
    id, base: str(row.base, id), set, site: site as CaptureSite, lang: str(row.lang, 'en'),
    source: str(row.source, 'synthetic'), condition: str(row.condition), risk: typeof row.risk === 'string' ? row.risk : null,
    page, gold: truths?.gold ?? none, alt: truths?.alt ?? [], masks, visualOnly: row.visual_only === true, meta,
  };
  if (truths?.goldMasksOn !== undefined) item.goldMasksOn = truths.goldMasksOn;
  return finishSite(item, row, input);
}

/** The per-site fields: what the command is asked, and the extra pages of locate and outcome. */
function finishSite(item: CaptureItem, row: Row, input: Row): CaptureItem | { skip: string } {
  const plain = (page: string): string => `/${page}`;
  switch (item.site) {
    case 'find':
      return { ...item, intent: str(input.intent) || str(row.intent), within: typeof row.within === 'string' ? row.within : null };
    case 'dismiss':
      return item;
    case 'presence':
      return { ...item, expectation: str(row.expectation) || str(input.expectation) };
    case 'page-state': {
      if ((row.states ?? input.states ?? 'research') !== 'research') return { skip: 'states other than the research set' };
      return { ...item, expect: str(row.expect) || str(input.expect) };
    }
    case 'locate': {
      const ref = elementRef(row.recorded_ref);
      const page = sideOf(row.recorded_page, plain);
      if (ref === null || page === null) return { skip: 'no recorded page or recorded_ref' };
      return { ...item, intent: str(input.intent) || str(row.intent), recorded: { page, ref } };
    }
    case 'outcome': {
      const before = sideOf(row.before, plain) ?? item.page;
      const after = sideOf(row.after, plain);
      const acted = actedOf(row);
      if (after === null || acted === null) return { skip: 'no after page or acted element' };
      return { ...item, page: before, intent: str(input.intent) || str(row.intent), outcome: { before, after, acted: acted.ref, actedSelector: acted.selector } };
    }
    case 'option-map': {
      const fieldValue = row.field_ref ?? row.field;
      const field = elementRef(fieldValue) ?? elementRef({ role: 'combobox', ...(fieldValue as Row ?? {}) });
      const want = str(row.want) || str(input.want);
      const gold = optionLabelOf(row.gold);
      if (field === null || want === '' || gold === null) return { skip: 'option-map row without field, want or gold label' };
      const key = (label: string) => (label === 'none' ? { kind: 'none' as const } : { kind: 'key' as const, value: label });
      const alts = (Array.isArray(row.alt) ? row.alt : []).map(optionLabelOf).filter((x): x is string => x !== null);
      const fieldSelector = typeof fieldValue === 'object' && fieldValue !== null ? str((fieldValue as Row).selector) || null : null;
      return {
        ...item, gold: { ref: key(gold), selector: null, name: gold === 'none' ? null : gold },
        alt: alts.map((label) => ({ ref: key(label), selector: null, name: label })),
        optionMap: { field, fieldSelector, want, open: row.open === true },
      };
    }
  }
}
