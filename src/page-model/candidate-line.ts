import type { AxNode, AxTree } from '../browser';
import { nodeAt } from './node-at';
import { cutName, norm } from './normalize';

// Ancestors that place an element on the page (spec §8.3). Navigation and main are shown bare: their names add
// little and vary across pages of one site.
const NAMED_PLACES: ReadonlySet<string> = new Set(['dialog', 'alertdialog', 'form', 'region']);
const BARE_PLACES: ReadonlySet<string> = new Set(['navigation', 'main']);

const pathMemo = new WeakMap<AxTree, readonly string[]>();

/** A name as a line shows it: `norm`ed, cut at 90, JSON-quoted so quotes and backslashes stay unambiguous. */
function quoted(name: string): string {
  return JSON.stringify(cutName(norm(name)));
}

function isPlace(node: AxNode): boolean {
  return NAMED_PLACES.has(node.role) || BARE_PLACES.has(node.role);
}

function placeLabel(node: AxNode): string {
  if (BARE_PLACES.has(node.role)) return node.role;
  return norm(node.name) === '' ? node.role : describeElement(node.role, node.name);
}

/**
 * Every node's path in one pass over text order. A node's scope is its innermost place; the heading it gets is
 * the last named heading seen before it in that same scope, so a heading inside a form never labels a button
 * after the form.
 */
function computePaths(tree: AxTree): string[] {
  const count = tree.nodes.length;
  const scope: number[] = new Array<number>(count);
  const places: (readonly string[])[] = new Array<readonly string[]>(count);
  const lastHeading = new Map<number, string>();
  const paths: string[] = new Array<string>(count);
  for (let i = 0; i < count; i += 1) {
    const node = tree.nodes[i]!;
    const p = node.parent;
    const parent = p === null || p >= i ? undefined : tree.nodes[p];
    if (parent === undefined || p === null) {
      scope[i] = -1;
      places[i] = [];
    } else if (isPlace(parent)) {
      scope[i] = p;
      places[i] = [...places[p]!, placeLabel(parent)];
    } else {
      scope[i] = scope[p]!;
      places[i] = places[p]!;
    }
    const heading = lastHeading.get(scope[i]!);
    paths[i] = (heading === undefined ? places[i]! : [...places[i]!, heading]).join(' > ');
    if (node.role === 'heading' && norm(node.name) !== '') {
      lastHeading.set(scope[i]!, `heading ${quoted(node.name)}`);
    }
  }
  return paths;
}

/** Node `i`'s path from the memo, for a node already known to exist. */
function pathAt(tree: AxTree, i: number): string {
  let paths = pathMemo.get(tree);
  if (paths === undefined) {
    paths = computePaths(tree);
    pathMemo.set(tree, paths);
  }
  return paths[i] ?? '';
}

/**
 * Outer to inner: `dialog|alertdialog "<n>"`, `navigation`, `main`, `form "<n>"`, `region "<n>"`, then the
 * nearest preceding `heading "<t>"` within the innermost of them, joined by ` > `. Empty with no ancestors.
 */
export function pathOf(tree: AxTree, i: number): string {
  nodeAt(tree, i);
  return pathAt(tree, i);
}

/** An element as refsure quotes it: `<role> "<name>"`, the name as a line shows it (page text). */
export function describeElement(role: string, name: string): string {
  return `${role} ${quoted(name)}`;
}

/**
 * Line format v1, the only shape a Decision sees: `<role> "<name>" in="<path>"`. The path is JSON-quoted as a
 * whole, so its inner quotes read `\"`. No attributes, no ordinal, never a value.
 */
export function lineOf(tree: AxTree, i: number): string {
  const node = nodeAt(tree, i);
  return `${describeElement(node.role, node.name)} in=${JSON.stringify(pathAt(tree, i))}`;
}
