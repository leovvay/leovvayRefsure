import { SITES } from '../../../src/questions';
import type { CandidateOrder, DecisionSite, OptionMapInput, PresentedCandidates, SiteId, SiteRequest, Verdict } from '../../../src/questions';
import type { CalibItem } from '../../calibrate/lib/calib-item';
import { readJsonl } from '../../calibrate/lib/jsonl';

/*
  A benchmark item: refsure's calibration item (`CalibItem`: the exact site input, gold, alt, labels), widened to
  option-map, plus the fields 3.1 and 3.4 add. Per-site reading of gold: what counts as acted, right and dangerous
  (Terms), the X1 gold-twin and X2 gold-cut decisions from the item's `p0` build, and the 3.1 group key.
*/

export type OptionMapItem = Omit<CalibItem, 'site' | 'input'> & { site: 'option-map'; input: Omit<OptionMapInput, 'order'> };

/** Extra fields a bench set may carry; all optional, so refsure's native captures read as they are. */
export interface BenchExtras {
  /** The 3.1 independence key when it is not `base` (F1: the page URL). Namespaced by `groupOf`. */
  group?: string;
  template?: string;
  /** `stored` (converted page text) or `native` (refsure's own capture); `native` when absent. */
  origin?: 'stored' | 'native';
  /** Raw accessible names and roles of the presented controls, for the 2.7 settle replay. */
  settleInputs?: { names: string[]; roles?: string[] };
}

export type BenchItem = (CalibItem | OptionMapItem) & BenchExtras;

export const CANDIDATE_SITES: ReadonlySet<SiteId> = new Set(['locate', 'find', 'dismiss', 'option-map']);

/** 2.3: `p0` is production's own order (no salt); `rb1`..`rb5` literal salts; `fixed` for non-candidate sites. */
export const CANDIDATE_ORDERS = ['p0', 'rb1', 'rb2', 'rb3', 'rb4', 'rb5'] as const;
export type OrderLabel = (typeof CANDIDATE_ORDERS)[number] | 'fixed';

export function isCandidateSite(site: SiteId): boolean {
  return CANDIDATE_SITES.has(site);
}

/** The salt an order label sends to refsure's shuffle (`null` for `p0` and `fixed`). */
export function saltOf(order: OrderLabel): string | null {
  return order === 'p0' || order === 'fixed' ? null : order;
}

function candidateOrder(order: OrderLabel): CandidateOrder {
  const salt = saltOf(order);
  return salt === null ? { kind: 'shuffled' } : { kind: 'shuffled', salt };
}

/** The orders an item is asked in by default: six for candidate sites, `fixed` otherwise. */
export function defaultOrders(item: BenchItem): OrderLabel[] {
  return isCandidateSite(item.site) ? [...CANDIDATE_ORDERS] : ['fixed'];
}

/** One item built by refsure's own site: the request, the site's read context and the wording hash `decide` uses. */
export interface Built {
  site: DecisionSite<unknown, unknown, unknown>;
  request: SiteRequest;
  context: unknown;
  wordingHash: string;
}

/** `site.build(input with order)`, exactly as a command builds it; `order` must be `fixed` off candidate sites. */
export function buildFor(item: BenchItem, order: OrderLabel): Built {
  const site = SITES[item.site];
  const candidate = isCandidateSite(item.site);
  if (candidate === (order === 'fixed')) throw new Error(`${item.id}: order ${order} does not fit site ${item.site}`);
  const input = candidate ? { ...item.input, order: candidateOrder(order) } : item.input;
  const { request, context } = site.build(input);
  const wording = site.wordingFor?.(input) ?? site.wording;
  return { site, request, context, wordingHash: wording.hash };
}

/**
 * Authored find and option-map sets (3.5: labelled blind from flat fields) carry the site input as top-level
 * `intent` + `candidates` or `field` + `want` + `options`, and option-map gold as an index number. Lift them into
 * `input` and a string gold, field for field; an item that already has `input` is left as it is.
 */
function liftFlatInput(item: BenchItem & Record<string, unknown>): void {
  if (typeof item.gold === 'number') (item as { gold: string }).gold = String(item.gold);
  if (typeof item.input === 'object' && item.input !== null) return;
  if (item.site === 'find' && typeof item.intent === 'string' && Array.isArray(item.candidates)) {
    (item as { input: unknown }).input = { intent: item.intent, lines: item.candidates };
  } else if (item.site === 'option-map' && typeof item.field === 'string' && typeof item.want === 'string' && Array.isArray(item.options)) {
    (item as { input: unknown }).input = { field: item.field, want: item.want, options: item.options };
  }
}

/** Reads a set file of bench items (one JSON object per line). Throws on an item without the fields every reading needs. */
export function readItems(path: string): BenchItem[] {
  const items = readJsonl<BenchItem>(path);
  if (items.length === 0) throw new Error(`${path}: no items`);
  for (const item of items) {
    liftFlatInput(item as BenchItem & Record<string, unknown>);
    if (typeof item.id !== 'string' || typeof item.gold !== 'string' || !(item.site in SITES) || typeof item.input !== 'object') {
      throw new Error(`${path}: item ${String(item.id)} lacks id, gold, a refsure site or input`);
    }
    if (!Array.isArray(item.alt)) item.alt = [];
    if (typeof item.base !== 'string') item.base = item.id;
  }
  return items;
}

/** The 3.1 group, namespaced by set (A1), so groups of different sets never meet in a pooled cell. */
export function groupOf(item: BenchItem, setId: string): string {
  return `${setId}:${item.group ?? item.base}`;
}

/** The text X4 checks for private terms: the whole site input. */
export function itemText(item: BenchItem): string {
  return JSON.stringify(item.input);
}

/** X1 and X2 for one item, decided from its `p0` build (bounds and the cut run before the shuffle). */
export interface GoldChecks {
  /** X1: the gold line reads the same as another offered line (settled by the twin rule in code). */
  goldTwin: boolean;
  /** X2: the cut dropped the gold line, so gold is `none` for this request. */
  goldCut: boolean;
  /** Gold and alt after X2. */
  gold: string;
  alt: string[];
}

export function goldChecks(item: BenchItem): GoldChecks {
  const plain = { goldTwin: false, goldCut: false, gold: item.gold, alt: [...item.alt] };
  if (!isCandidateSite(item.site) || item.gold === 'none') return plain;
  const built = buildFor(item, 'p0');
  const context = built.context as PresentedCandidates;
  const offered = new Map<number, string>();
  for (const key of Object.keys(context.criteria)) {
    const index = context.indexOf(key);
    if (index !== null) offered.set(index, key);
  }
  const goldKey = offered.get(Number(item.gold));
  const alt = item.alt.filter((value) => value === 'none' || offered.has(Number(value)));
  if (goldKey === undefined) return { goldTwin: false, goldCut: true, gold: 'none', alt };
  const text = context.criteria[goldKey];
  const twin = Object.entries(context.criteria).some(([key, other]) => key !== goldKey && other === text);
  return { goldTwin: twin, goldCut: false, gold: item.gold, alt };
}

/** What the Terms read from one R1 verdict: acted, right (gold or alt), and acted in the site's dangerous direction. */
export interface Scored { acted: boolean; correct: boolean; dangerous: boolean }

export function score(site: SiteId, verdict: Verdict<unknown>, gold: string, alt: readonly string[]): Scored {
  if (verdict.kind !== 'answer') return { acted: false, correct: false, dangerous: false };
  const truths = new Set([gold, ...alt]);
  if (site === 'outcome' || site === 'presence') {
    // refsure answers only `landed` / `present`: an act claims true.
    return { acted: true, correct: truths.has('true'), dangerous: !truths.has('true') };
  }
  const value = String(verdict.value);
  const correct = truths.has(value);
  if (site === 'page-state') return { acted: true, correct, dangerous: value === 'expected' && !truths.has('expected') };
  return { acted: true, correct, dangerous: !correct };
}

/** 3.1 D299: gold `none` on candidate sites, false on presence/outcome, not `expected` on page-state. */
export function dangerEligible(site: SiteId, gold: string): boolean {
  if (isCandidateSite(site)) return gold === 'none';
  if (site === 'page-state') return gold !== 'expected';
  return gold === 'false';
}
