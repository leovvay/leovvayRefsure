import type { CfgId } from '../e2e/scenario';
import type { ArmRuntime } from '../lib/ask';
import type { BenchItem } from '../lib/items';
import type { CaptureItem } from './capture-item';
import { benchBody, type Cli, dryBody, noBodyWhy, runCli } from './parity';
import { type BenchDeps, onPage } from './stored-page';

/*
  Smoke parity for the sites tools/calibrate captures (locate, find, dismiss, page-state, presence): the command
  refsure's agent would run on the same page (`locate --recorded L --intent I`, `locate --intent I [--within W]`,
  `dismiss`, `state --expect E`, `wait-for --expect E`), under `--dry-run`, must print the body the bench builds for
  the captured item. Masks-on items only (every cfg runs with PII masks on).
*/

export interface SiteParity { id: string; arm: string; equal: boolean; why: string[] }

function argvFor(item: BenchItem, cap: CaptureItem): string[] | null {
  const input = item.input as Record<string, unknown>;
  switch (item.site) {
    case 'locate':
      return ['locate', `--recorded=${String(input.recorded)}`, `--intent=${String(input.intent)}`];
    case 'find':
      return ['locate', `--intent=${String(input.intent)}`, ...(cap.within ? [`--within=${cap.within}`] : [])];
    case 'dismiss':
      return ['dismiss'];
    case 'page-state':
      return ['state', `--expect=${cap.expect ?? ''}`];
    case 'presence':
      return ['wait-for', `--expect=${cap.expectation ?? ''}`, '--timeout', '5s'];
    default:
      return null;
  }
}

export async function siteParity(cap: CaptureItem, item: BenchItem, deps: BenchDeps, cli: Cli, cfg: CfgId, rt: ArmRuntime): Promise<SiteParity> {
  const argv = argvFor(item, cap);
  if (argv === null || item.masks === false) return { id: item.id, arm: rt.arm.id, equal: false, why: ['not checked'] };
  const opened = await onPage(deps, cap.page, () => runCli(cli, cfg, [...argv, '--page', deps.tab.pageId, '--dry-run']));
  if ('away' in opened) return { id: item.id, arm: rt.arm.id, equal: false, why: ['page away'] };
  const dry = dryBody(opened.read.env);
  const body = benchBody(rt, item);
  const why = dry === null ? [noBodyWhy(opened.read)] : dry === body ? [] : ['bodies differ'];
  return { id: item.id, arm: rt.arm.id, equal: dry !== null && dry === body, why };
}
