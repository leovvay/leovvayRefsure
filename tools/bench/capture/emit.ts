import type { CodeRow } from '../../calibrate/lib/code-row';
import type { GoldRef } from '../../calibrate/lib/gold-ref';
import { modeId } from '../../calibrate/lib/item-page';
import type { BenchItem } from '../lib/items';
import { goldChecks } from '../lib/items';
import type { CaptureItem, Truth } from './capture-item';

/*
  What one capture writes: a bench item to ask (refsure's exact site input, gold and alt as offered indices or keys,
  the X1/X2 reading of its p0 build, the row's own labels), or a row code settled or the capture dropped (X5: the
  end-to-end slice, never a model reading).
*/

export type Emitted = { kind: 'ask'; item: BenchItem; goldNotOffered: boolean } | { kind: 'row'; row: CodeRow };

export function goldText(ref: GoldRef): string {
  return ref.kind === 'element' ? `${ref.role} ${JSON.stringify(ref.name)} #${ref.ordinal}` : ref.kind === 'none' ? 'none' : ref.value;
}

/** The gold of one mask mode: N10's masks-on gold when it has one. */
export function truthFor(item: CaptureItem, masks: boolean): Truth {
  return masks && item.goldMasksOn !== undefined ? item.goldMasksOn : item.gold;
}

export function idFor(item: CaptureItem, masks: boolean): string {
  return item.masks.length > 1 ? modeId(item.id, masks) : item.id;
}

export function codeRow(item: CaptureItem, kind: CodeRow['kind'], rule: string, answer: string | null, correct: boolean | null, masks?: boolean): Emitted {
  const row: CodeRow = {
    id: masks === undefined ? item.id : idFor(item, masks), set: item.set, site: item.site, kind, answer,
    gold: goldText(masks === undefined ? item.gold.ref : truthFor(item, masks).ref), correct, rule,
    condition: item.condition, lang: item.lang,
  };
  if (masks !== undefined) row.masks = masks;
  if (item.visualOnly) row.visualOnly = true;
  return { kind: 'row', row };
}

export const dropRow = (item: CaptureItem, rule: string): Emitted => codeRow(item, 'drop', rule, null, null);

/** A bench item in one mask mode, with X1/X2 decided from its `p0` build and stored (3.4). */
export function askItem(
  item: CaptureItem, masks: boolean, input: unknown, gold: string, alt: string[],
  extra: { settleInputs?: BenchItem['settleInputs']; goldNotOffered?: boolean } = {},
): Emitted {
  const out = {
    id: idFor(item, masks), base: item.base, lang: item.lang, source: item.source, condition: item.condition,
    risk: item.risk, set: item.set, site: item.site, input, gold, alt: alt.filter((a) => a !== gold), masks,
    origin: 'native' as const, ...(item.visualOnly ? { visualOnly: true } : {}),
    ...(typeof item.meta.template === 'string' ? { template: item.meta.template } : {}),
    ...(extra.settleInputs ? { settleInputs: extra.settleInputs } : {}),
  } as unknown as BenchItem;
  const x = goldChecks(Object.assign({}, out, { gold_not_offered: extra.goldNotOffered === true }));
  const labels = { ...item.meta, gold_twin: x.goldTwin, gold_cut: x.goldCut, gold_not_offered: extra.goldNotOffered === true };
  return { kind: 'ask', item: { ...labels, ...out } as BenchItem, goldNotOffered: extra.goldNotOffered === true };
}
