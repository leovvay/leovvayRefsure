import type { AxTree } from '../browser';
import { pathOf } from './candidate-line';
import { norm } from './normalize';

interface TwinIndex {
  keys: readonly string[];
  groups: ReadonlyMap<string, readonly number[]>;
}

const twinMemo = new WeakMap<AxTree, TwinIndex>();

/** A twin group is the nodes with equal `(role, norm(name), path)` (spec §8.3). */
export function twinKey(role: string, name: string, path: string): string {
  return JSON.stringify([role, norm(name), path]);
}

function indexOf(tree: AxTree): TwinIndex {
  const known = twinMemo.get(tree);
  if (known !== undefined) return known;
  const keys: string[] = [];
  const groups = new Map<string, number[]>();
  tree.nodes.forEach((node, i) => {
    const key = twinKey(node.role, node.name, pathOf(tree, i));
    keys.push(key);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [i]);
    else group.push(i);
  });
  const built = { keys, groups };
  twinMemo.set(tree, built);
  return built;
}

/** The node indices sharing a twin key, in snapshot-text order (never by ref number); empty when none. */
export function groupOf(tree: AxTree, role: string, name: string, path: string): number[] {
  return [...(indexOf(tree).groups.get(twinKey(role, name, path)) ?? [])];
}

/** Node `i`'s twin group, itself included, in snapshot-text order. */
export function twinsOf(tree: AxTree, i: number): number[] {
  const index = indexOf(tree);
  const key = index.keys[i];
  if (key === undefined) throw new RangeError(`no node ${i} in the snapshot`);
  return [...(index.groups.get(key) ?? [i])];
}
