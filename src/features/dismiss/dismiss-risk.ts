import type { AxTree, PageRef } from '../../browser';
import type { CommandContext } from '../../cli';
import { classify, mergeReadings, pageRaisers, type RiskReading } from '../../risk';
import { turnedReadings } from './dismiss-reading';

/** The tree with node `i` named `name`, for the risk rules to read that name in its place. */
function renamed(tree: AxTree, i: number, name: string): AxTree {
  return { ...tree, nodes: tree.nodes.map((node, at) => (at === i ? { ...node, name } : node)) };
}

/**
 * The risk of clicking node `i` (spec §8.4, §8.5): the lexicon, confirm-dialog and URL rules on the tree, and the
 * page raisers for a click. A name with a negated accept ("Continuer sans accepter") is read in each of its
 * readings with every negated accept as the reject it is (`turnedReadings`); the highest class counts, and the
 * reasons say `negated:accept`.
 */
export async function dismissRisk(
  ctx: CommandContext, page: PageRef, url: string, tree: AxTree, i: number,
): Promise<RiskReading> {
  const turned = turnedReadings(tree.nodes[i]?.name ?? '');
  const lexical = turned === null
    ? [classify(tree, i, { url, action: 'click' })]
    : turned.map((name) => classify(renamed(tree, i, name), i, { url, action: 'click' }));
  const merged = mergeReadings(...lexical, await pageRaisers(ctx.browser, page, 'click'));
  return turned === null ? merged : { ...merged, reasons: [...merged.reasons, 'negated:accept'] };
}
