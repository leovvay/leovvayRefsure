import type { TabInfo } from '../../../src/browser';
import { outcomeInput } from '../../../src/features/outcome';
import { candidatesOf } from '../../../src/page-model';
import { findGold } from '../../calibrate/lib/gold-map';
import type { CfgId } from '../e2e/scenario';
import type { ArmRuntime } from '../lib/ask';
import type { BenchItem } from '../lib/items';
import type { CaptureItem } from './capture-item';
import { readOutcome } from './outcome';
import { benchBody, type Cli, dryBody, noBodyWhy, runCli, stateField } from './parity';
import { type BenchDeps, onPage } from './stored-page';

/*
  3.5 outcome parity on one captured item (masks on, refsure's default), for one cfg and its arm:
  - wrap: `outcome --intent I --expect-name N -- click --element @eN --dry-run` on the before page prints the body
    with refsure's stand-in after-side; the bench body of the item with that stand-in (`outcomeInput(.., null)`)
    must equal it byte for byte (acted line, before side, bounds, wording). This pair is the P0 golden pair.
  - mark: `mark` on the before page, then the after page, then `outcome --mark M --dry-run`: its `before` (and
    `after`) must equal the bench body's (equal only while the URL has no query and the text fits the mark's cut).
  - reread: both pages read again and built by refsure's `outcomeInput`: the bench body must not change.
*/

export interface OutcomeParity {
  id: string; arm: string; query: boolean; wrap: boolean; mark_before: boolean; mark_after: boolean; reread: boolean | null;
  why: string[]; golden?: { dry: string; body: string; item: BenchItem };
}

const standIn = (item: BenchItem): BenchItem => {
  const input = item.input as { intent: string; acted: string; before: string; after: string };
  const blank = { tab: { url: '', title: '' } as TabInfo, text: '', typed: { pieces: [] } };
  return { ...item, input: { ...input, after: outcomeInput('', '', blank, null, { piiMasks: true }).after } } as BenchItem;
};

export async function outcomeParity(
  cap: CaptureItem, item: BenchItem, deps: BenchDeps, cli: Cli, cfg: CfgId, rt: ArmRuntime, reread: boolean,
): Promise<OutcomeParity> {
  const o = cap.outcome!;
  const why: string[] = [];
  const page = ['--page', deps.tab.pageId, '--dry-run'];
  const intent = `--intent=${cap.intent ?? ''}`;
  const before = await onPage(deps, o.before, async (p) => {
    const node = findGold(candidatesOf(await deps.browser.snapshot(p)), o.acted);
    if (node === null) return null;
    const wrap = await runCli(cli, cfg, ['outcome', intent, `--expect-name=${o.acted.name}`, ...page, '--', 'click', '--element', `@${node.ref}`]);
    const mark = await runCli(cli, cfg, ['mark', '--page', deps.tab.pageId]);
    return { wrap, mark: (mark.env?.result as { mark?: string } | null)?.mark ?? null, markRun: mark };
  });
  if ('away' in before || before.read === null) return { id: item.id, arm: rt.arm.id, query: o.before.at.includes('?'), wrap: false, mark_before: false, mark_after: false, reread: null, why: ['before page'] };
  const { wrap, mark, markRun } = before.read;
  const wrapDry = dryBody(wrap.env);
  const golden = standIn(item);
  const wrapBench = benchBody(rt, golden);
  if (wrapDry === null) why.push(`wrap: ${noBodyWhy(wrap)}`);
  let markDry: string | null = null;
  if (mark === null) why.push(`mark: ${noBodyWhy(markRun)}`);
  else {
    const after = await onPage(deps, o.after, () => runCli(cli, cfg, ['outcome', intent, `--mark=${mark}`, ...page]), 600);
    markDry = 'away' in after ? null : dryBody(after.read.env);
    if (markDry === null) why.push(`mark: ${'away' in after ? 'after page away' : noBodyWhy(after.read)}`);
  }
  const body = benchBody(rt, item);
  let again: boolean | null = null;
  if (reread) {
    const r = await readOutcome(cap, deps);
    again = 'drop' in r ? false : benchBody(rt, { ...item, input: outcomeInput(cap.intent ?? '', r.acted, r.before, r.after, { piiMasks: true }) } as BenchItem) === body;
  }
  const out: OutcomeParity = {
    id: item.id, arm: rt.arm.id, query: o.before.at.includes('?'), wrap: wrapDry !== null && wrapDry === wrapBench,
    mark_before: markDry !== null && stateField(markDry, 'before') === stateField(body, 'before'),
    mark_after: markDry !== null && stateField(markDry, 'after') === stateField(body, 'after'), reread: again, why,
  };
  if (wrapDry !== null && wrapBench !== null) out.golden = { dry: wrapDry, body: wrapBench, item: golden };
  return out;
}
