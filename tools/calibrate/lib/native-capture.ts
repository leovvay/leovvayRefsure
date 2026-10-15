import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AxTree, PageRef, TabInfo } from '../../../src/browser';
import { type Candidate, candidatesOf, fold } from '../../../src/page-model';
import type { CalibItem } from './calib-item';
import type { CaptureDeps } from './capture-deps';
import type { Captured } from './captured';
import type { CodeRow } from './code-row';
import type { GoldRef } from './gold-ref';
import { codeHit, keyOf, offeredIndex, placesOf } from './gold-map';
import { modeId } from './item-page';
import type { NativeItem } from './native-item';
import { dismissScene, distinct, findScene, locateScene, pageStateCode, pageStateInputOf, presenceInputOf } from './native-inputs';

/*
  One item of the Orca-native replay (spec §9 step 2): the stored page is served on 127.0.0.1 and opened in the
  harness's tab (isolated profile), snapshotted through refsure's own Orca adapter, and turned into the input its
  command would send. The set's gold is mapped onto the lines refsure offers by role, name and ordinal. What code
  would settle with no Decision becomes a row of its own, scored but never fitted. A page that navigated off the
  page server while it was read (a script or a refresh in the stored page) is dropped: run.ts sends items with no
  origin to check, so nothing another origin shows may become an input.
*/

type Opened<T> = { read: T; tab: TabInfo } | { away: true };

const goldText = (ref: GoldRef): string => (ref.kind === 'element' ? `${ref.role} ${JSON.stringify(ref.name)} #${ref.ordinal}` : ref.kind === 'none' ? 'none' : ref.value);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Serves a stored page at `at`, opens it in the tab, lets it settle and runs `read` on it. The tab's URL is read
 * last, so a page that left the page server's origin at any point before it is caught, and `away` is returned.
 */
async function onStoredPage<T>(deps: CaptureDeps, at: string, file: string, read: (page: PageRef) => Promise<T>): Promise<Opened<T>> {
  const [path = '/', query] = at.split(/\?(.*)/s);
  const url = deps.server.mount(path, join(deps.root, file)) + (query === undefined || query === '' ? '' : `?${query}`);
  try {
    await deps.tab.goto(url);
    await sleep(deps.settleMs);
    const page: PageRef = { backend: 'orca', id: deps.tab.pageId };
    const value = await read(page);
    const tab = await deps.browser.tabInfo(page);
    return originOf(tab.url) === deps.server.origin ? { read: value, tab } : { away: true };
  } finally {
    deps.server.unmount(path);
  }
}

function row(item: NativeItem, kind: CodeRow['kind'], rule: string, answer: string | null, correct: boolean | null, masks?: boolean): Captured {
  const out: CodeRow = {
    id: item.id, set: item.set, site: item.site, kind, answer, gold: goldText(item.gold), correct, rule,
    condition: item.condition, lang: item.lang,
  };
  if (masks !== undefined) out.masks = masks;
  if (item.visualOnly === true) out.visualOnly = true;
  return { kind: 'row', row: out };
}

const awayRow = (item: NativeItem): Captured => row(item, 'drop', 'navigated_away', null, null);

function base(item: NativeItem) {
  return {
    id: item.id, base: item.base, lang: item.lang, source: item.source, condition: item.condition, risk: item.risk,
    set: item.set, ...(item.visualOnly === true ? { visualOnly: true } : {}),
  };
}

/** Gold and alt as offered indices; `null` when the gold is not on the page at all. */
function offeredTruth(item: NativeItem, offered: readonly Candidate[], cands: readonly Candidate[]) {
  const gold = offeredIndex(offered, cands, item.gold);
  if (gold === 'unmapped') return null;
  const alt = item.alt.map((ref) => offeredIndex(offered, cands, ref)).filter((x): x is string => x !== null && x !== 'unmapped');
  return { gold: gold ?? 'none', alt: alt.filter((x) => x !== (gold ?? 'none')), goldNotOffered: gold === null };
}

/** Code settles on no element (no overlay, no candidates, the veto): right when gold is none. */
function codeNone(item: NativeItem, rule: string): Captured {
  return row(item, 'code', rule, 'none', item.gold.kind === 'none');
}

/**
 * A code pick: right when it is the gold's twin group (or an alt's). A pick whose group still has twins among
 * `scope` (the `--within` rows) stops at the twin rule: no answer.
 */
function codeAnswer(item: NativeItem, pick: Candidate, all: readonly Candidate[], rule: string, scope: readonly Candidate[] = all): Captured {
  const group = scope.filter((c) => keyOf(c) === keyOf(pick)).length;
  if (pick.fp.twins > 1 && group > 1) return row(item, 'code', `${rule}+twins`, 'twins', null);
  return row(item, 'code', rule, pick.line, codeHit(pick, all, [item.gold, ...item.alt]));
}

/**
 * The line refsure's own snapshot gives the recorded element on the recording page, or why there is none. When
 * its role and name show in several places (navigation and main), the recorded descriptor's place kinds pick the
 * line, if they leave exactly one.
 */
function recordedLine(item: NativeItem, tree: AxTree): string | { why: string } {
  const ref = item.recordedRef;
  if (ref?.kind !== 'element') return { why: 'no recorded element' };
  const same = candidatesOf(tree).filter((c) => c.fp.role === ref.role && fold(c.fp.name) === fold(ref.name));
  const lines = [...new Set(distinct(same).map((c) => c.line))];
  if (lines.length === 0) return { why: 'the recorded element is not on the recording page' };
  if (lines.length === 1) return lines[0]!;
  const hint = ref.hint;
  const placed = hint === undefined ? []
    : [...new Set(same.filter((c) => placesOf(c.fp.path) === placesOf(hint)).map((c) => c.line))];
  return placed.length === 1 ? placed[0]! : { why: `the recorded element matches ${lines.length} different lines` };
}

async function captureCandidates(item: NativeItem, deps: CaptureDeps): Promise<Captured[]> {
  const snapshot = (page: PageRef) => deps.browser.snapshot(page);
  let recorded = '';
  if (item.site === 'locate') {
    const rec = await onStoredPage(deps, item.at, item.recordedPage ?? item.page, snapshot);
    if ('away' in rec) return [awayRow(item)];
    const line = recordedLine(item, rec.read);
    if (typeof line !== 'string') return [row(item, 'drop', line.why, null, null)];
    recorded = line;
  }
  const opened = await onStoredPage(deps, item.at, item.page, snapshot);
  if ('away' in opened) return [awayRow(item)];
  const tree = opened.read;
  if (item.site === 'dismiss') {
    const scene = dismissScene(tree);
    if (scene.kind !== 'ask') return [codeNone(item, scene.kind)];
    const truth = offeredTruth(item, scene.offered, scene.inside);
    if (truth === null) return [row(item, 'drop', 'gold control not in the overlay', null, null)];
    const ask: CalibItem = { ...base(item), ...truth, site: 'dismiss', input: scene.input };
    return [{ kind: 'ask', item: ask, offered: scene.offered.length, goldNotOffered: truth.goldNotOffered }];
  }
  const all = candidatesOf(tree);
  const scene = item.site === 'locate'
    ? locateScene(all, recorded, item.intent ?? '')
    : findScene(tree, all, item.intent ?? '', item.within ?? null);
  const truth = offeredTruth(item, scene.offered, all);
  if (truth === null) return [row(item, 'drop', 'gold element not on the page', null, null)];
  if (scene.cands.length === 0) return [codeNone(item, 'no_candidates')];
  if (scene.code !== null) return [codeAnswer(item, scene.code, all, item.site === 'locate' ? 'recorded_line' : 'exact_name', scene.cands)];
  const ask: CalibItem = 'recorded' in scene.input
    ? { ...base(item), ...truth, site: 'locate', input: scene.input }
    : { ...base(item), ...truth, site: 'find', input: scene.input };
  return [{ kind: 'ask', item: ask, offered: scene.offered.length, goldNotOffered: truth.goldNotOffered }];
}

async function captureText(item: NativeItem, deps: CaptureDeps): Promise<Captured[]> {
  const gold = item.gold.kind === 'key' ? item.gold.value : 'none';
  if (item.site === 'presence') {
    const opened = await onStoredPage(deps, item.at, item.page, (page) => deps.browser.text(page, 'body'));
    if ('away' in opened) return [awayRow(item)];
    const input = presenceInputOf(item.expectation ?? '', opened.tab, opened.read, deps.piiMasks);
    const ask: CalibItem = { ...base(item), gold, alt: [], masks: deps.piiMasks, site: 'presence', input };
    return [{ kind: 'ask', item: ask, offered: 0, goldNotOffered: false }];
  }
  const opened = await onStoredPage(deps, item.at, item.page, async (page) => {
    const [tab, tree] = await Promise.all([deps.browser.tabInfo(page), deps.browser.snapshot(page)]);
    const code = pageStateCode(tree, tab);
    return { tab, tree, code, body: code === null ? await deps.browser.text(page, 'body') : '' };
  });
  if ('away' in opened) return [awayRow(item)];
  const { tab, tree, code, body } = opened.read;
  const modes = item.masks ?? [deps.piiMasks];
  if (code !== null) return modes.map((masks) => row(item, 'code', code, code, code === gold, masks));
  return modes.map((masks) => {
    const input = pageStateInputOf(tree, tab, body, item.expect ?? '', masks);
    const id = modes.length > 1 ? modeId(item.id, masks) : item.id;
    const ask: CalibItem = { ...base(item), id, gold, alt: [], masks, site: 'page-state', input };
    return { kind: 'ask', item: ask, offered: 0, goldNotOffered: false };
  });
}

/** Captures one item; an error from Orca or the page becomes a dropped row naming it, never a crash. */
export async function captureItem(item: NativeItem, deps: CaptureDeps): Promise<Captured[]> {
  try {
    return item.site === 'presence' || item.site === 'page-state'
      ? await captureText(item, deps)
      : await captureCandidates(item, deps);
  } catch (error) {
    return [row(item, 'drop', `capture_error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300), null, null)];
  }
}
