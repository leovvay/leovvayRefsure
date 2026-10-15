import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AxTree, PageRef, TabInfo } from '../../../src/browser';
import { type Candidate, candidatesOf, fold, twinKey } from '../../../src/page-model';
import type { CalibItem } from './calib-item';
import type { CaptureDeps } from './capture-deps';
import type { Captured } from './captured';
import type { CodeRow } from './code-row';
import type { GoldRef } from './gold-ref';
import { codeHit, offeredIndex } from './gold-map';
import type { NativeItem } from './native-item';
import { dismissScene, distinct, findScene, locateScene, pageStateCode, pageStateInputOf, presenceInputOf } from './native-inputs';

/*
  One item of the Orca-native replay (spec §9 step 2): the stored page is served on 127.0.0.1 and opened in the
  harness's tab (isolated profile), snapshotted through refsure's own Orca adapter, and turned into the input its
  command would send. The set's gold is mapped onto the lines refsure offers by role, name and ordinal. What code
  would settle with no Decision becomes a row of its own, scored but never fitted.
*/

type Read = { page: PageRef; tab: TabInfo; tree: AxTree };

const goldText = (ref: GoldRef): string => (ref.kind === 'element' ? `${ref.role} ${JSON.stringify(ref.name)} #${ref.ordinal}` : ref.kind === 'none' ? 'none' : ref.value);

async function open(deps: CaptureDeps, at: string, file: string): Promise<Read> {
  const [path = '/', query] = at.split(/\?(.*)/s);
  const url = deps.server.mount(path, join(deps.root, file)) + (query === undefined || query === '' ? '' : `?${query}`);
  await deps.tab.goto(url);
  await sleep(deps.settleMs);
  const page: PageRef = { backend: 'orca', id: deps.tab.pageId };
  const [tab, tree] = await Promise.all([deps.browser.tabInfo(page), deps.browser.snapshot(page)]);
  deps.server.unmount(path);
  return { page, tab, tree };
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

/**
 * A code pick: right when it is the gold's twin group (or an alt's); a `none` by code is right when gold is none.
 * A pick whose group still has twins among `scope` (the `--within` rows) stops at the twin rule: no answer.
 */
function codeAnswer(item: NativeItem, pick: Candidate | null, all: readonly Candidate[], rule: string, scope: readonly Candidate[] = all): Captured {
  if (pick === null) return row(item, 'code', rule, 'none', item.gold.kind === 'none');
  const key = twinKey(pick.fp.role, pick.fp.name, pick.fp.path);
  const group = scope.filter((c) => twinKey(c.fp.role, c.fp.name, c.fp.path) === key).length;
  if (pick.fp.twins > 1 && group > 1) return row(item, 'code', `${rule}+twins`, 'twins', null);
  return row(item, 'code', rule, pick.line, codeHit(pick, all, [item.gold, ...item.alt]));
}

/** The line refsure's own snapshot gives the recorded element on the recording page, or why there is none. */
function recordedLine(item: NativeItem, tree: AxTree): string | { why: string } {
  const ref = item.recordedRef;
  if (ref?.kind !== 'element') return { why: 'no recorded element' };
  const same = candidatesOf(tree).filter((c) => c.fp.role === ref.role && fold(c.fp.name) === fold(ref.name));
  const lines = [...new Set(distinct(same).map((c) => c.line))];
  if (lines.length === 0) return { why: 'the recorded element is not on the recording page' };
  if (lines.length === 1) return lines[0]!;
  const byPath = same.find((c) => c.fp.path === ref.path);
  return byPath ? byPath.line : { why: `the recorded element matches ${lines.length} different lines` };
}

async function captureCandidates(item: NativeItem, deps: CaptureDeps): Promise<Captured[]> {
  let recorded = '';
  if (item.site === 'locate') {
    const rec = await open(deps, item.at, item.recordedPage ?? item.page);
    const line = recordedLine(item, rec.tree);
    if (typeof line !== 'string') return [row(item, 'drop', line.why, null, null)];
    recorded = line;
  }
  const { tree } = await open(deps, item.at, item.page);
  const all = candidatesOf(tree);
  if (item.site === 'dismiss') {
    const scene = dismissScene(tree);
    if (scene.kind !== 'ask') return [codeAnswer(item, null, all, scene.kind)];
    const truth = offeredTruth(item, scene.offered, scene.inside);
    if (truth === null) return [row(item, 'drop', 'gold control not in the overlay', null, null)];
    const ask: CalibItem = { ...base(item), ...truth, site: 'dismiss', input: scene.input };
    return [{ kind: 'ask', item: ask, offered: scene.offered.length, goldNotOffered: truth.goldNotOffered }];
  }
  const scene = item.site === 'locate'
    ? locateScene(tree, recorded, item.intent ?? '')
    : findScene(tree, item.intent ?? '', item.within ?? null);
  const truth = offeredTruth(item, scene.offered, all);
  if (truth === null) return [row(item, 'drop', 'gold element not on the page', null, null)];
  if (scene.cands.length === 0) return [codeAnswer(item, null, all, 'no_candidates')];
  if (scene.code !== null) return [codeAnswer(item, scene.code, all, item.site === 'locate' ? 'recorded_line' : 'exact_name', scene.cands)];
  const ask: CalibItem = 'recorded' in scene.input
    ? { ...base(item), ...truth, site: 'locate', input: scene.input }
    : { ...base(item), ...truth, site: 'find', input: scene.input };
  return [{ kind: 'ask', item: ask, offered: scene.offered.length, goldNotOffered: truth.goldNotOffered }];
}

async function captureText(item: NativeItem, deps: CaptureDeps): Promise<Captured[]> {
  const { page, tab, tree } = await open(deps, item.at, item.page);
  const gold = item.gold.kind === 'key' ? item.gold.value : 'none';
  if (item.site === 'presence') {
    const body = await deps.browser.text(page, 'body');
    const input = presenceInputOf(item.expectation ?? '', tab, body, deps.piiMasks);
    const ask: CalibItem = { ...base(item), gold, alt: [], masks: deps.piiMasks, site: 'presence', input };
    return [{ kind: 'ask', item: ask, offered: 0, goldNotOffered: false }];
  }
  const modes = item.masks ?? [deps.piiMasks];
  const code = pageStateCode(tree, tab);
  if (code !== null) return modes.map((masks) => row(item, 'code', code, code, code === gold, masks));
  const body = await deps.browser.text(page, 'body');
  return modes.map((masks) => {
    const input = pageStateInputOf(tree, tab, body, item.expect ?? '', masks);
    const id = modes.length > 1 ? `${item.id}~masks-${masks ? 'on' : 'off'}` : item.id;
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
