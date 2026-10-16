import { setTimeout as sleep } from 'node:timers/promises';
import type { AxTree, PageRef } from '../../../src/browser';
import { foldTwins, optionLabel, optionsOf } from '../../../src/features/pick-option/option-nodes';
import { candidatesOf, contentWords, cutName, fold, lineOf, norm } from '../../../src/page-model';
import { findGold } from '../../calibrate/lib/gold-map';
import type { CaptureItem } from './capture-item';
import { askItem, codeRow, dropRow, type Emitted, truthFor } from './emit';
import { type BenchDeps, onPage, probeSelector } from './stored-page';

/*
  Option-map capture (3.5): `pick-option --field @eN --want W` read from one snapshot, its private steps restated
  (pick-option.command.ts `ranked`, `chooseOption`): the field's options (`optionsOf`), the code pick by folded label
  (one = `exact_name`, two or more = `ambiguous_option`, both settled in code: X5), else the options ranked by
  content words shared with `want` (ties in page order) and cut to `cutName(norm(label))`. The field line is
  `lineOf(tree, field)`. `open: true` clicks the field first and waits as `--open` does (400 ms). Gold is an option
  label; one folding equal to two options is dropped (refsure refuses either pick).
*/

const OPEN_SETTLE_MS = 400;

export interface FieldScene { tree: AxTree; field: number; fieldRef: string; options: number[]; offered: number[]; input: { field: string; want: string; options: string[] } }

function ranked(tree: AxTree, options: readonly number[], want: string): number[] {
  const words = new Set(contentWords(want));
  const score = (at: number): number => contentWords(optionLabel(tree, at)).filter((w) => words.has(w)).length;
  return options.map((at, k) => ({ at, k, score: score(at) })).sort((a, b) => b.score - a.score || a.k - b.k).map((o) => o.at);
}

/** The field and its options as pick-option reads them, on the page already open in the tab. */
export async function readField(item: CaptureItem, deps: BenchDeps, page: PageRef): Promise<FieldScene | { drop: string }> {
  const om = item.optionMap!;
  let tree = await deps.browser.snapshot(page);
  const cand = findGold(candidatesOf(tree), om.field);
  if (cand === null) return { drop: 'field not on the page' };
  if (om.fieldSelector !== null && (await probeSelector(deps, om.fieldSelector))?.length !== 1) return { drop: 'field selector does not match one element' };
  let fieldRef = String(cand.ref);
  const listed = (t: AxTree): boolean => t.nodes.some((n) => n.role === 'listbox' || n.role === 'option');
  for (let attempt = 1; om.open && attempt <= 2; attempt += 1) {
    if (attempt > 1) {
      // The click did not open the list (seen in long runs): load the page again and click once more.
      await deps.tab.goto((await deps.browser.tabInfo(page)).url);
      await sleep(deps.settleMs);
      const again = findGold(candidatesOf(await deps.browser.snapshot(page)), om.field);
      if (again === null) return { drop: 'field not on the reloaded page' };
      fieldRef = String(again.ref);
    }
    const sent = await deps.browser.act(page, fieldRef as typeof cand.ref, 'click');
    if (sent.kind === 'stale_ref' || sent.kind === 'unknown') return { drop: `opening the field: ${sent.kind}` };
    await sleep(OPEN_SETTLE_MS);
    tree = await deps.browser.snapshot(page);
    if (listed(tree)) break;
    if (attempt === 2) return { drop: `opened field lists no options (act ${sent.kind}, ${tree.nodes.length} nodes)` };
  }
  const field = tree.nodes.findIndex((node) => node.ref === fieldRef);
  if (field === -1) return { drop: 'field ref gone after opening' };
  const { options } = optionsOf(tree, field);
  const offered = ranked(tree, options, om.want);
  const labels = offered.map((at) => cutName(norm(optionLabel(tree, at))));
  return { tree, field, fieldRef, options, offered, input: { field: lineOf(tree, field), want: om.want, options: labels } };
}

/** The offered index of an option label, `none`, or why it cannot be mapped. */
function indexOf(scene: FieldScene, label: string | null): string | { drop: string } {
  if (label === null) return 'none';
  const twins = foldTwins(scene.tree, scene.options, label);
  if (twins.length === 0) return { drop: 'gold option not in the field' };
  if (twins.length > 1) return { drop: 'gold option folds equal to another option' };
  return String(scene.offered.indexOf(twins[0]!));
}

export async function captureOptionMap(item: CaptureItem, deps: BenchDeps): Promise<Emitted[]> {
  const opened = await onPage(deps, item.page, (page) => readField(item, deps, page));
  if ('away' in opened) return [dropRow(item, 'navigated_away')];
  const scene = opened.read;
  if ('drop' in scene) return [dropRow(item, scene.drop)];
  const goldName = item.gold.ref.kind === 'none' ? null : item.gold.name;
  if (scene.options.length === 0) return [codeRow(item, 'code', 'no_options', 'none', goldName === null)];
  const exact = foldTwins(scene.tree, scene.options, item.optionMap!.want);
  if (exact.length > 1) return [codeRow(item, 'code', 'ambiguous_option', null, null)];
  if (exact.length === 1) {
    const label = optionLabel(scene.tree, exact[0]!);
    return [codeRow(item, 'code', 'exact_name', label, goldName !== null && fold(label) === fold(goldName))];
  }
  const gold = indexOf(scene, goldName);
  if (typeof gold !== 'string') return [dropRow(item, gold.drop)];
  const alt: string[] = [];
  for (const a of item.alt) {
    const at = indexOf(scene, a.name);
    if (typeof at !== 'string') return [dropRow(item, at.drop.replace(/^gold /, 'alt '))];
    alt.push(at);
  }
  return item.masks.map((masks) => askItem(item, masks, scene.input, truthFor(item, masks).ref.kind === 'none' ? 'none' : gold, alt));
}
