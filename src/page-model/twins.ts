import type { AxTree } from '../browser';
import { pathOf } from './candidate-line';
import { nodeAt } from './node-at';
import { norm } from './normalize';

interface TwinIndex {
  keys: readonly string[];
  groups: ReadonlyMap<string, readonly number[]>;
  /** Each node's 1-based place in its twin group, recorded while the groups are built. */
  ordinals: readonly number[];
}

const twinMemo = new WeakMap<AxTree, TwinIndex>();
const NO_TWINS: readonly number[] = [];

/** A twin group is the nodes with equal `(role, norm(name), path)` (spec §8.3). */
export function twinKey(role: string, name: string, path: string): string {
  return JSON.stringify([role, norm(name), path]);
}

function indexOf(tree: AxTree): TwinIndex {
  const known = twinMemo.get(tree);
  if (known !== undefined) return known;
  const keys: string[] = [];
  const ordinals: number[] = [];
  const groups = new Map<string, number[]>();
  tree.nodes.forEach((node, i) => {
    const key = twinKey(node.role, node.name, pathOf(tree, i));
    keys.push(key);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [i]);
    else group.push(i);
    ordinals.push(group?.length ?? 1);
  });
  const built = { keys, groups, ordinals };
  twinMemo.set(tree, built);
  return built;
}

/** The node indices sharing a twin key, in snapshot-text order (never by ref number); empty when none. */
export function groupOf(tree: AxTree, role: string, name: string, path: string): readonly number[] {
  return indexOf(tree).groups.get(twinKey(role, name, path)) ?? NO_TWINS;
}

/** Node `i`'s twin group, itself included, in snapshot-text order. */
export function twinsOf(tree: AxTree, i: number): readonly number[] {
  nodeAt(tree, i);
  const index = indexOf(tree);
  return index.groups.get(index.keys[i]!) ?? [i];
}

/** Node `i`'s 1-based place in its twin group and the group's size, without scanning the group. */
export function twinPlaceOf(tree: AxTree, i: number): { ordinal: number; twins: number } {
  const twins = twinsOf(tree, i);
  return { ordinal: indexOf(tree).ordinals[i]!, twins: twins.length };
}
