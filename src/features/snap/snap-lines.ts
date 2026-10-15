import type { AxTree } from '../../browser';
import { fingerprintOf, insideValueField, INTERACTIVE_ROLES, lineOf, norm } from '../../page-model';
import type { SnapScope } from './snap.args';

const SCOPE_ROLES: Readonly<Record<SnapScope, ReadonlySet<string>>> = {
  dialog: new Set(['dialog', 'alertdialog']),
  main: new Set(['main']),
  form: new Set(['form']),
};

/** Whether a strict ancestor of node `i` has one of `roles`. An ancestor test, so a form inside main is a form. */
function within(tree: AxTree, i: number, roles: ReadonlySet<string>): boolean {
  let at = tree.nodes[i]?.parent ?? null;
  while (at !== null) {
    const node = tree.nodes[at];
    if (node === undefined) return false;
    if (roles.has(node.role)) return true;
    at = node.parent;
  }
  return false;
}

/**
 * Whether node `i` is listed without `--interactive`: a named node, never one inside a value field (that text is
 * what was typed), and never a StaticText that only repeats its parent's name.
 */
function namedNode(tree: AxTree, i: number): boolean {
  const node = tree.nodes[i]!;
  const name = norm(node.name);
  if (name === '' || insideValueField(tree, i)) return false;
  if (node.role !== 'StaticText' || node.parent === null) return true;
  return norm(tree.nodes[node.parent]?.name ?? '') !== name;
}

/**
 * The lines `snap` prints, in snapshot-text order: `lineOf(i) + ' #<ordinal>/<twins> @eN'`. A named node without a
 * ref has no `@eN`. Values never appear: `lineOf` reads only role, name and path.
 */
export function snapLines(tree: AxTree, opts: { scope: SnapScope | null; interactive: boolean }): string[] {
  const roles = opts.scope === null ? null : SCOPE_ROLES[opts.scope];
  const out: string[] = [];
  tree.nodes.forEach((node, i) => {
    if (roles !== null && !within(tree, i, roles)) return;
    if (opts.interactive ? node.ref === null || !INTERACTIVE_ROLES.has(node.role) : !namedNode(tree, i)) return;
    const fp = fingerprintOf(tree, i);
    const ref = node.ref === null ? '' : ` @${node.ref}`;
    out.push(`${lineOf(tree, i)} #${fp.ordinal}/${fp.twins}${ref}`);
  });
  return out;
}

/** Keeps whole lines while the joined text fits `maxChars`; the rest are counted, never split. */
export function cutLines(lines: readonly string[], maxChars: number): { kept: string[]; dropped: number } {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const add = (kept.length > 0 ? 1 : 0) + line.length;
    if (used + add > maxChars) break;
    used += add;
    kept.push(line);
  }
  return { kept, dropped: lines.length - kept.length };
}
