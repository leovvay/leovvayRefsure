import type { AxNode, AxTree } from '../ax-tree';
import { BrowserError } from '../browser-error';
import { nextAnchors, refCounts, refVouched } from './ref-check';
import { snapshotBody } from './snapshot-body';
import type { SnapshotLine } from './snapshot-line-shape';
import { readLine } from './snapshot-line';
import { withRefSpacing } from './spacing';
import { valueSpan } from './value-span';
import { nameClickables } from './clickable-names';

/**
 * Where each multi-line value ends: the lines its run-on text covers are marked, and the whole value is kept.
 * A line inside an earlier value is never a value's start.
 */
function valueRuns(lines: readonly (SnapshotLine | null)[], raw: readonly string[], anchors: readonly number[]) {
  const runOn = new Array<boolean>(raw.length).fill(false);
  const values = new Map<number, string>();
  for (let j = 0; j < raw.length; j += 1) {
    if (runOn[j] || lines[j]?.value == null) continue;
    const span = valueSpan(lines, raw, j, anchors[j] ?? raw.length);
    if (span === 0) continue;
    for (let k = 1; k <= span; k += 1) runOn[j + k] = true;
    values.set(j, [lines[j]!.value, ...raw.slice(j + 1, j + 1 + span)].join('\n'));
  }
  return { runOn, values };
}

/**
 * Reads agent-browser snapshot JSON (Orca's `{result:{origin, refs, snapshot}}`, the bare result, agent-browser's
 * own `{data:{snapshot}}`, or the snapshot text itself) into a backend-neutral tree. Order, nesting, attributes
 * and values come from the text; the `refs` map is what the text is checked against:
 * - A value's run-on lines (see `valueSpan`) stay part of the value and never become nodes.
 * - A line whose ref the map does not vouch for, or a ref printed twice, is unparsed: page text can print any
 *   `[ref=eN]`, so neither copy of a doubled ref is trusted.
 * - A ref'd node's name takes its spacing from the map (see `withRefSpacing`).
 * Unparsed lines are counted in `dropped` and skipped; a skipped level attaches to the nearest open ancestor.
 */
export function parseSnapshot(json: unknown, pageId: string): AxTree {
  const body = snapshotBody(json);
  if (!body) throw new BrowserError('backend_error', 'the snapshot reply carries no snapshot text');
  const raw = body.text.split(/\r?\n/);
  const lines = raw.map(readLine);
  const { runOn, values } = valueRuns(lines, raw, nextAnchors(lines, body.refs));
  const counts = refCounts(lines, (j) => !runOn[j]);
  const nodes: AxNode[] = [];
  const stack: AxNode[] = [];
  let dropped = 0;
  for (let j = 0; j < raw.length; j += 1) {
    if (runOn[j] || raw[j]!.trim() === '') continue;
    const line = lines[j];
    if (!line || (line.ref !== null && (counts.get(line.ref) !== 1 || !refVouched(line, body.refs)))) {
      dropped += 1;
      continue;
    }
    const level = Math.floor(line.indent / 2);
    while (stack.length > level) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const value = values.get(j) ?? line.value;
    const node: AxNode = {
      i: nodes.length,
      depth: stack.length,
      role: line.role,
      name: withRefSpacing(line.name, line.ref, body.refs),
      ref: line.ref,
      attrs: line.attrs,
      value: value === null || value === '' ? null : value,
      parent: parent ? parent.i : null,
      children: [],
    };
    parent?.children.push(node.i);
    nodes.push(node);
    stack.push(node);
  }
  nameClickables(nodes);
  return { origin: body.origin, pageId, nodes, dropped };
}
