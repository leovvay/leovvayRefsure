import { captureItem } from '../../calibrate/lib/native-capture';
import type { NativeItem } from '../../calibrate/lib/native-item';
import type { CaptureItem } from './capture-item';
import { askItem, codeRow, type Emitted, idFor, truthFor } from './emit';
import type { BenchDeps } from './stored-page';

/*
  presence and page-state through tools/calibrate's own capture (`captureItem`: `wait-for --expect`'s and `state
  --expect`'s inputs, `state`'s code rules). presence cleans the page text in the capture, so each mask mode is
  captured on its own; page-state builds every mode from one reading.
*/

function nativeOf(item: CaptureItem, masks: readonly boolean[]): NativeItem {
  const base = {
    id: item.id, base: item.base, set: item.set, page: item.page.page, at: item.page.at, lang: item.lang,
    source: item.source, condition: item.condition, risk: item.risk, gold: item.gold.ref, alt: item.alt.map((a) => a.ref),
    ...(item.visualOnly ? { visualOnly: true } : {}),
  };
  return item.site === 'presence'
    ? { ...base, site: 'presence', expectation: item.expectation ?? '' }
    : { ...base, site: 'page-state', expect: item.expect ?? '', masks };
}

function fromCalib(item: CaptureItem, results: Awaited<ReturnType<typeof captureItem>>, mode: boolean | null): Emitted[] {
  return results.map((result) => {
    if (result.kind === 'ask') {
      const masks = result.item.masks ?? mode ?? true;
      const gold = truthFor(item, masks).ref;
      const key = gold.kind === 'key' ? gold.value : 'none';
      return askItem(item, masks, result.item.input, key, []);
    }
    const r = result.row;
    if (r.kind === 'drop') return codeRow(item, 'drop', r.rule, null, null, r.masks ?? mode ?? undefined);
    return codeRow(item, 'code', r.rule, r.answer, r.correct, r.masks ?? mode ?? undefined);
  });
}

export async function captureTextSite(item: CaptureItem, deps: BenchDeps): Promise<Emitted[]> {
  if (item.site === 'page-state') return fromCalib(item, await captureItem(nativeOf(item, item.masks), deps), null);
  const out: Emitted[] = [];
  for (const masks of item.masks) {
    const results = await captureItem(nativeOf(item, [masks]), { ...deps, piiMasks: masks });
    out.push(...fromCalib(item, results, masks));
  }
  return out;
}

