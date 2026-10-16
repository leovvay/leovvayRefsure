import { setTimeout as sleep } from 'node:timers/promises';
import { candidatesOf } from '../../../src/page-model';
import { findGold } from '../../calibrate/lib/gold-map';
import type { CfgId } from '../e2e/scenario';
import type { ArmRuntime } from '../lib/ask';
import type { BenchItem } from '../lib/items';
import type { CaptureItem } from './capture-item';
import { benchBody, type Cli, dryBody, noBodyWhy, runCli } from './parity';
import { type BenchDeps, onPage } from './stored-page';

/*
  3.5 option-map parity on one captured item: on a fresh load of its page, `pick-option --field @eN --want W
  --dry-run` prints the Jev body (a field that lists its options only once open is clicked open first, as
  refsure's own hint says: `--open` checks its route before the click, so under `--dry-run` it prints no body);
  the bench body of the captured item must equal it byte for byte. This pair is also the P0 golden pair.
*/

export interface OptionMapParity { id: string; arm: string; equal: boolean; why: string[]; golden?: { dry: string; body: string; item: BenchItem } }

export async function optionMapParity(cap: CaptureItem, item: BenchItem, deps: BenchDeps, cli: Cli, cfg: CfgId, rt: ArmRuntime): Promise<OptionMapParity> {
  const om = cap.optionMap!;
  const opened = await onPage(deps, cap.page, async (page) => {
    const field = findGold(candidatesOf(await deps.browser.snapshot(page)), om.field);
    if (field === null) return null;
    if (om.open) {
      await deps.browser.act(page, field.ref, 'click');
      await sleep(400);
    }
    return runCli(cli, cfg, ['pick-option', '--field', `@${field.ref}`, `--want=${om.want}`, '--page', deps.tab.pageId, '--dry-run']);
  });
  if ('away' in opened || opened.read === null) return { id: item.id, arm: rt.arm.id, equal: false, why: ['field not found on reload'] };
  const dry = dryBody(opened.read.env);
  const body = benchBody(rt, item);
  const why = dry === null ? [noBodyWhy(opened.read)] : dry === body ? [] : ['bodies differ'];
  const out: OptionMapParity = { id: item.id, arm: rt.arm.id, equal: dry !== null && dry === body, why };
  if (dry !== null && body !== null) out.golden = { dry, body, item };
  return out;
}
