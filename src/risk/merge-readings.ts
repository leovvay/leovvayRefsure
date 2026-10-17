import type { AxTree, BrowserPort, PageRef } from '../browser';
import { classify } from './classify';
import { maxRisk } from './max-risk';
import { pageRaisers } from './raisers';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';

/** Several readings of one element as one (spec §8.1 invariant 4): the highest class, every reason once, in order. */
export function mergeReadings(...readings: RiskReading[]): RiskReading {
  return { class: maxRisk(...readings.map((r) => r.class)), reasons: [...new Set(readings.flatMap((r) => r.reasons))] };
}

/** A `read` lifted to `write`, saying `floor:write`: a step that writes a value, or a pick no `--risk read` claimed. */
export function floorAtWrite(reading: RiskReading): RiskReading {
  return reading.class === 'read' ? { class: 'write', reasons: [...reading.reasons, 'floor:write'] } : reading;
}

/**
 * The page raisers, read once per snapshot: every pick judged on one tree (`do`'s steps on one look) shares the page
 * as it read then. A fresh snapshot is a new tree and reads again; a failed read is not kept.
 */
const raisedOn = new WeakMap<AxTree, Promise<RiskReading>>();

function pageRaisedOn(port: BrowserPort, page: PageRef, tree: AxTree): Promise<RiskReading> {
  const kept = raisedOn.get(tree);
  if (kept) return kept;
  const read = pageRaisers(port, page, 'click');
  raisedOn.set(tree, read);
  read.catch(() => raisedOn.delete(tree));
  return read;
}

/**
 * The risk of clicking node `i` of a snapshot (spec §8.3, §8.5): the lexicon, confirm-dialog, URL and `--risk`
 * rules on the tree, and the page raisers for a click, read once per snapshot.
 */
export async function clickRisk(
  port: BrowserPort, page: PageRef, tree: AxTree, i: number, opts: { url: string; userRisk?: RiskClass },
): Promise<RiskReading> {
  return mergeReadings(classify(tree, i, { ...opts, action: 'click' }), await pageRaisedOn(port, page, tree));
}
