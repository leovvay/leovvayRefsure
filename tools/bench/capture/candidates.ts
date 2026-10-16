import type { AxTree, PageRef } from '../../../src/browser';
import { type Candidate, candidateKey, candidatesOf, distinctByGroup, fold } from '../../../src/page-model';
import { codeHit, findGold, offeredIndex, placesOf } from '../../calibrate/lib/gold-map';
import { dismissScene, findScene, locateScene } from '../../calibrate/lib/native-inputs';
import type { CaptureItem, ElementRef, Truth } from './capture-item';
import { askItem, codeRow, dropRow, type Emitted, truthFor } from './emit';
import { type BenchDeps, onPage, probeSelector } from './stored-page';

/*
  locate, find and dismiss from live snapshots, through tools/calibrate/lib/native-inputs.ts (each command's own
  steps). Gold `{selector, name}` is mapped by its `gold_ref` onto the lines refsure offers (twin group, ordinal),
  then checked: the mapped element's name must fold-equal the stated name, and the selector must match exactly one
  element on the page. `settleInputs` keep each offered control's raw name and role (2.7). PII mask modes (N10)
  share one capture: the egress pipeline masks at ask time, so each mode is the same input with its own gold.
*/

const nameOf = (tree: AxTree, c: Candidate): string => tree.nodes[c.node]?.name ?? c.fp.name;

/** The recorded element's line on the recording page (calibrate `recordedLine`, restated: it is private there). */
function recordedLine(ref: ElementRef, tree: AxTree): string | { why: string } {
  const same = candidatesOf(tree).filter((c) => c.fp.role === ref.role && fold(c.fp.name) === fold(ref.name));
  const lines = [...new Set(distinctByGroup(same).map((c) => c.line))];
  if (lines.length === 0) return { why: 'the recorded element is not on the recording page' };
  if (lines.length === 1) return lines[0]!;
  const hint = ref.hint;
  const placed = hint === undefined ? [] : [...new Set(same.filter((c) => placesOf(c.fp.path) === placesOf(hint)).map((c) => c.line))];
  return placed.length === 1 ? placed[0]! : { why: `the recorded element matches ${lines.length} different lines` };
}

/** Why a stated element gold does not hold on the live page, or null when it does. */
async function goldDefect(deps: BenchDeps, truth: Truth, all: readonly Candidate[]): Promise<string | null> {
  if (truth.ref.kind !== 'element') return null;
  const gold = findGold(all, truth.ref);
  if (gold === null) return 'gold element not on the page';
  if (truth.name !== null && fold(gold.fp.name) !== fold(truth.name)) return 'gold name differs from the mapped element';
  if (truth.selector === null) return null;
  const hits = await probeSelector(deps, truth.selector);
  if (hits === null) return 'selector probe failed';
  return hits.length === 1 ? null : `gold selector matches ${hits.length} elements`;
}

type Scene = { offered: Candidate[]; all: readonly Candidate[]; cands: readonly Candidate[]; code: Candidate | null; input: unknown; tree: AxTree };

async function sceneOf(item: CaptureItem, deps: BenchDeps): Promise<Scene | Emitted> {
  const snapshot = (page: PageRef) => deps.browser.snapshot(page);
  let recorded = '';
  if (item.site === 'locate' && item.recorded) {
    const rec = await onPage(deps, item.recorded.page, snapshot);
    if ('away' in rec) return dropRow(item, 'navigated_away');
    const line = recordedLine(item.recorded.ref, rec.read);
    if (typeof line !== 'string') return dropRow(item, line.why);
    recorded = line;
  }
  const opened = await onPage(deps, item.page, async (page) => ({ tree: await snapshot(page), defects: [] as string[] }));
  if ('away' in opened) return dropRow(item, 'navigated_away');
  const { tree } = opened.read;
  const truths = [item.gold, ...(item.goldMasksOn ? [item.goldMasksOn] : []), ...item.alt];
  const all = candidatesOf(tree);
  for (const truth of truths) {
    const defect = await goldDefect(deps, truth, all);
    if (defect !== null) return dropRow(item, defect);
  }
  if (item.site === 'dismiss') {
    const scene = dismissScene(tree);
    if (scene.kind !== 'ask') return codeNone(item, scene.kind);
    return { offered: scene.offered, all: scene.inside, cands: scene.inside, code: null, input: scene.input, tree };
  }
  const scene = item.site === 'locate' ? locateScene(all, recorded, item.intent ?? '') : findScene(tree, all, item.intent ?? '', item.within ?? null);
  return { offered: scene.offered, all, cands: scene.cands, code: scene.code, input: scene.input, tree };
}

/** Code settles on no element (no overlay, no controls, the veto, no candidates): right when gold is none. */
function codeNone(item: CaptureItem, rule: string): Emitted {
  return codeRow(item, 'code', rule, 'none', item.gold.ref.kind === 'none');
}

/** A code pick (exact name, the recorded line); a pick whose group still has twins stops at the twin rule. */
function codeAnswer(item: CaptureItem, scene: Scene, pick: Candidate, rule: string): Emitted {
  const group = scene.cands.filter((c) => candidateKey(c) === candidateKey(pick)).length;
  if (pick.fp.twins > 1 && group > 1) return codeRow(item, 'code', `${rule}+twins`, 'twins', null);
  return codeRow(item, 'code', rule, pick.line, codeHit(pick, scene.all, [item.gold.ref, ...item.alt.map((a) => a.ref)]));
}

/** Captures one locate, find or dismiss item: one bench item per mask mode, or the row code or the capture wrote. */
export async function captureCandidates(item: CaptureItem, deps: BenchDeps): Promise<Emitted[]> {
  const scene = await sceneOf(item, deps);
  if ('kind' in scene) return [scene];
  if (scene.cands.length === 0) return [codeNone(item, 'no_candidates')];
  if (scene.code !== null) return [codeAnswer(item, scene, scene.code, item.site === 'locate' ? 'recorded_line' : 'exact_name')];
  const settleInputs = { names: scene.offered.map((c) => nameOf(scene.tree, c)), roles: scene.offered.map((c) => c.fp.role) };
  const out: Emitted[] = [];
  for (const masks of item.masks) {
    const truth = truthFor(item, masks);
    const gold = offeredIndex(scene.offered, scene.all, truth.ref);
    if (gold === 'unmapped') return [dropRow(item, 'gold element not mapped')];
    const alt = item.alt.map((a) => offeredIndex(scene.offered, scene.all, a.ref)).filter((x): x is string => x !== null && x !== 'unmapped');
    out.push(askItem(item, masks, scene.input, gold ?? 'none', alt, { settleInputs, goldNotOffered: gold === null }));
  }
  return out;
}
