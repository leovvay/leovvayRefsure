import type { AxTree } from '../../browser';
import {
  DIALOG_ROLES, fingerprintOf, insideValueField, INTERACTIVE_ROLES, lineOf, nearestAncestor, norm,
} from '../../page-model';
import type { SnapScope } from './snap.args';

const SCOPE_ROLES: Readonly<Record<SnapScope, ReadonlySet<string>>> = {
  dialog: DIALOG_ROLES,
  main: new Set(['main']),
  form: new Set(['form']),
};

/** Whether a strict ancestor of node `i` has one of `roles`. An ancestor test, so a form inside main is a form. */
function within(tree: AxTree, i: number, roles: ReadonlySet<string>): boolean {
  return nearestAncestor(tree, i, (node) => roles.has(node.role)) !== null;
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

/** The most `--max-chars` takes. */
export const MAX_CHARS_LIMIT = 1_000_000;

/** The lines' joined length, a newline between each: what `--max-chars` counts. */
export function linesLength(lines: readonly string[]): number {
  return lines.reduce((sum, line, k) => sum + line.length + (k > 0 ? 1 : 0), 0);
}

/** The `--max-chars` that prints every line: their joined length, within the flag's own limit. */
export function wholeBudget(total: number): number {
  return Math.min(total, MAX_CHARS_LIMIT);
}

/**
 * Keeps whole lines while the joined text fits `maxChars`; the rest are counted, never split. When lines are cut,
 * the footer `N lines dropped (~T tokens): --max-chars=<total> shows all` ends the list (T: the dropped lines'
 * characters over 4; total: the whole list's joined length, which `total` returns too) and counts against the
 * budget; a budget too small for even the footer gets no lines at all, and `dropped` still says how many there were.
 */
export function cutLines(lines: readonly string[], maxChars: number): { lines: string[]; dropped: number; total: number } {
  const total = linesLength(lines);
  if (total <= maxChars) return { lines: [...lines], dropped: 0, total };
  const shows = `--max-chars=${wholeBudget(total)} shows ${total <= MAX_CHARS_LIMIT ? 'all' : 'the most one call can'}`;
  // `used` is the kept lines' joined length; the newline after them goes with the cut.
  const footer = (kept: number, used: number): string => {
    const rest = kept === 0 ? total : total - used - 1;
    return `${lines.length - kept} lines dropped (~${Math.round(rest / 4)} tokens): ${shows}`;
  };
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const add = (kept.length > 0 ? 1 : 0) + line.length;
    if (used + add + 1 + footer(kept.length + 1, used + add).length > maxChars) break;
    used += add;
    kept.push(line);
  }
  const dropped = lines.length - kept.length;
  const last = footer(kept.length, used);
  if (used + (kept.length > 0 ? 1 : 0) + last.length > maxChars) return { lines: kept, dropped, total };
  return { lines: [...kept, last], dropped, total };
}
