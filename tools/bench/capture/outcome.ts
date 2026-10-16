import type { PageRef } from '../../../src/browser';
import { outcomeInput, SETTLE_MS } from '../../../src/features/outcome';
import { type Candidate, candidatesOf, describeElement, fold } from '../../../src/page-model';
import type { PageReading } from '../../../src/features/shared';
import { actionRole, liveRefRisk, readLiveTarget } from '../../../src/risk';
import { findGold } from '../../calibrate/lib/gold-map';
import type { CaptureItem } from './capture-item';
import { askItem, dropRow, type Emitted, truthFor } from './emit';
import { type BenchDeps, onPage, probeSelector } from './stored-page';

/*
  Outcome capture (3.5): the before page is read the way `outcome -- click --element @eN` reads it before the act
  (refsure's `readLiveTarget` on the acted element's ref: the name the live ref shows, its role, the body text), the
  after page is opened after `SETTLE_MS` the way the command reads it after the act, and the input is refsure's own
  `outcomeInput(intent, acted, before, after)` (cleaned sides; PII masks per mode; no filled value: every step is a
  press). `acted` is therefore `describeElement(role, seen)` (`button "Save"`), the string refsure sends, not the
  authored v1 preview. The class `liveRefRisk` gives the press is kept (`refsure_risk_class`): `outcome --` refuses
  money, irreversible, auth and consent before acting, `act --ticket --verify` asks the site for any class.
*/

export interface OutcomeReadings { before: PageReading; after: PageReading; acted: string; riskClass: string; actedRef: string }

/** Reads both sides of one outcome item, or the reason it was dropped. */
export async function readOutcome(item: CaptureItem, deps: BenchDeps): Promise<OutcomeReadings | { drop: string }> {
  const o = item.outcome;
  if (o === undefined) return { drop: 'no outcome pages' };
  const read = async (page: PageRef): Promise<Omit<OutcomeReadings, 'after'> | { drop: string }> => {
    const tree = await deps.browser.snapshot(page);
    const node: Candidate | null = findGold(candidatesOf(tree), o.acted);
    if (node === null) return { drop: 'acted element not on the before page' };
    if (fold(node.fp.name) !== fold(o.acted.name)) return { drop: 'acted name differs from the mapped element' };
    if (o.actedSelector !== null) {
      const hits = await probeSelector(deps, o.actedSelector);
      if (hits?.length !== 1) return { drop: `acted selector matches ${hits === null ? 'unknown' : hits.length} elements` };
    }
    const target = await readLiveTarget(deps.browser, page, node.ref, 'click');
    const tab = await deps.browser.tabInfo(page);
    const risk = await liveRefRisk(deps.browser, page, node.ref, 'click', target, { url: tab.url });
    const acted = describeElement(target.role ?? actionRole('click'), target.live.seen);
    return { before: { tab, text: target.bodyText }, acted, riskClass: risk.class, actedRef: String(node.ref) };
  };
  const before = await onPage(deps, o.before, read);
  if ('away' in before) return { drop: 'navigated_away' };
  if ('drop' in before.read) return before.read;
  const after = await onPage(deps, o.after, async (page) => {
    const [tab, text] = await Promise.all([deps.browser.tabInfo(page), deps.browser.text(page, 'body')]);
    return { tab, text };
  }, SETTLE_MS);
  if ('away' in after) return { drop: 'after page navigated_away' };
  return { ...before.read, after: after.read };
}

export async function captureOutcome(item: CaptureItem, deps: BenchDeps): Promise<Emitted[]> {
  const r = await readOutcome(item, deps);
  if ('drop' in r) return [dropRow(item, r.drop)];
  return item.masks.map((masks) => {
    const input = outcomeInput(item.intent ?? '', r.acted, r.before, r.after, { piiMasks: masks });
    const gold = truthFor(item, masks).ref;
    const emitted = askItem(item, masks, input, gold.kind === 'key' ? gold.value : 'none', []);
    if (emitted.kind === 'ask') Object.assign(emitted.item, { refsure_risk_class: r.riskClass });
    return emitted;
  });
}
