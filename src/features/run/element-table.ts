import type { AxNode, AxTree } from '../../browser';
import { escapeRegExp } from '../../shared';
import { cleanEgressText } from '../../egress';
import {
  type Candidate, candidateKey, contentWords, cutName, DIALOG_ROLES, describeElement, fold, isValueField,
  nearestAncestor, norm, rowTextOf, subtree,
} from '../../page-model';
import type { StepRow } from '../../questions';
import type { ElementTable, TableEntry, TableHints } from './element-table-shape';

/** A value or a row text as a row shows it. */
const VALUE_SHOWN = 60;
const ROW_SHOWN = 60;
/** The most options of one select offered, those nearest the goal and the values first. */
const OPTIONS_MAX = 30;
/** The most rows of one family of look-alikes (`familyCut`). */
const FAMILY_MAX = 16;

/** A native select: a combobox holding its options (agent-browser prints `<select>` so). */
function optionNodes(tree: AxTree, node: number): number[] {
  if (tree.nodes[node]?.role !== 'combobox') return [];
  return subtree(tree, node).filter((at) => {
    const option = tree.nodes[at];
    return at !== node && option?.role === 'option' && option.attrs.disabled === undefined;
  });
}

/** Case, spacing and accents aside ("Zürich" holds "Zurich"). */
function loose(text: string): string {
  return fold(text).normalize('NFD').replace(/\p{M}/gu, '');
}

/** Whether a field's value holds a `--fill` value: the same text, or the value as whole words in it ("London, UK"). */
export function holds(fieldValue: string, fillValue: string): boolean {
  const field = loose(fieldValue);
  const fill = loose(fillValue);
  if (field === '' || fill === '') return false;
  return field === fill || new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(fill)}(?![\\p{L}\\p{N}])`, 'u').test(field);
}

/** A label as a select matches it: ASCII whitespace collapsed and trimmed, nothing else changed. */
function labelOf(node: AxNode | undefined): string {
  return (node?.name ?? '').replace(/[\t\n\f\r ]+/g, ' ').replace(/^ | $/g, '');
}

/**
 * Up to 30 labels, those sharing a word or a short number (a day, a count) with the goal or a value first, then in
 * page order: a cut keeps the first.
 */
function rankedLabels(labels: readonly string[], words: ReadonlySet<string>, numbers: ReadonlySet<string>): string[] {
  const named = (label: string): boolean => contentWords(label).some((w) => words.has(w))
    || shortNumbers(label).some((n) => numbers.has(n));
  const scored = labels.map((label, at) => ({ label, at, hit: named(label) ? 0 : 1 }));
  return scored.sort((a, b) => a.hit - b.hit || a.at - b.at).slice(0, OPTIONS_MAX).map((s) => s.label);
}

/** A value field by its element (fingerprint): how `TableHints.kinds` knows it from look to look. */
export function fieldKey(cand: Candidate): string {
  return `${candidateKey(cand)}\n${cand.fp.ordinal}`;
}

/**
 * A field whose value only a settled kind lets a row show: text no `--fill` value holds, in a field that is no
 * native select (whose value is an option label) and that the tree does not mark editable. A `role="textbox"`
 * contenteditable prints as a plain textbox, and an editable region's text is never sent (spec §7.3).
 */
function needsKind(tree: AxTree, cand: Candidate, hints: TableHints): boolean {
  const node = tree.nodes[cand.node]!;
  if (!isValueField(node) || node.attrs.contenteditable === true || optionNodes(tree, cand.node).length > 0) return false;
  const value = norm(node.value ?? '');
  return value !== '' && !hints.fills.some((one) => holds(value, one.value));
}

/** The value fields of a look whose value a row would show once settled, and that no look has settled yet. */
export function unsettledFields(tree: AxTree, cands: readonly Candidate[], hints: TableHints): string[] {
  return cands.filter((cand) => needsKind(tree, cand, hints) && !hints.kinds.has(fieldKey(cand))).map(fieldKey);
}

/**
 * The field's value as the row shows it: the text cut, or `empty`; an editable region, or a field not yet told
 * apart from one (`needsKind`), only says it holds text. A value that is one of the `--fill` values says which:
 * masks can make two different e-mails read the same.
 */
function valuePart(tree: AxTree, cand: Candidate, hints: TableHints): string {
  const node = tree.nodes[cand.node]!;
  if (!isValueField(node)) return '';
  const value = norm(node.value ?? '');
  if (value === '') return ' = empty';
  if (node.attrs.contenteditable === true) return ' = (holds text)';
  if (needsKind(tree, cand, hints) && hints.kinds.get(fieldKey(cand)) !== 'input') return ' = (holds text)';
  const shown = ` = ${JSON.stringify(cutName(value, VALUE_SHOWN))}`;
  const fill = hints.fills.find((one) => holds(value, one.value));
  if (fill !== undefined) return `${shown} (holds ${fill.key})`;
  // Masked, a value can read like a `--fill` value it is not ("[email]" both): say it is not that one.
  const masked = cleanEgressText(value, true);
  const lookalike = hints.fills.find((one) => cleanEgressText(one.value, true) === masked);
  return lookalike === undefined ? shown : `${shown} (differs from the ${lookalike.key} value)`;
}

/** The states a dropped wrapper (`wrappers`) passes to its control, where the control has none of its own. */
const CARRIED = ['selected', 'checked', 'pressed'] as const;

/** The control's state, as the tree gives it, with its dropped wrapper's selected, checked or pressed. */
function statePart(node: AxNode, wrapper?: AxNode): string {
  const carried = CARRIED.filter((name) => wrapper?.attrs[name] !== undefined)
    .map((name) => [name, wrapper!.attrs[name]]);
  const attrs = carried.length === 0 ? node.attrs : { ...Object.fromEntries(carried), ...node.attrs };
  const states: string[] = [];
  if (attrs.checked !== undefined) {
    states.push(attrs.checked === 'true' ? 'checked' : attrs.checked === 'mixed' ? 'partly checked' : 'not checked');
  }
  if (attrs.pressed !== undefined) states.push(attrs.pressed === 'true' ? 'pressed' : 'not pressed');
  if (attrs.expanded !== undefined) states.push(attrs.expanded === 'true' ? 'expanded' : 'collapsed');
  if (attrs.selected === true || attrs.selected === 'true') states.push('selected');
  if (attrs.disabled === true || attrs.disabled === 'true') states.push('disabled');
  return states.length === 0 ? '' : ` (${states.join(', ')})`;
}

/** Numbers of one or two digits, which `contentWords` leaves out: a day of the month, a count of guests. */
export function shortNumbers(text: string): string[] {
  return [...new Set(text.match(/(?<!\d)\d{1,2}(?!\d)/g) ?? [])];
}

/** How much of the goal and the values a row names: each shared word counts 1, each shared short number 0.5. */
function weightOf(text: string, wanted: ReadonlySet<string>, numbers: ReadonlySet<string>): number {
  const words = contentWords(text).filter((w) => wanted.has(w)).length;
  return words + shortNumbers(text).filter((n) => numbers.has(n)).length / 2;
}

/**
 * Wrappers whose one control inside carries their own name (a calendar's gridcell around its day button), each
 * with that control: the control is the row, and the wrapper would only double the table. The wrapper's state
 * (a selected gridcell) is the row's too.
 */
function wrappers(tree: AxTree, cands: readonly Candidate[]): Map<number, number> {
  const at = new Map(cands.map((cand) => [cand.node, cand]));
  const out = new Map<number, number>();
  for (const cand of cands) {
    const up = nearestAncestor(tree, cand.node, (node) => at.has(node.i));
    if (up !== null && at.get(up)!.fp.name === cand.fp.name) out.set(up, cand.node);
  }
  return out;
}

/**
 * The control's nearest named ancestor when it carries the control's own name: a wrapper that is no candidate
 * itself (a calendar's gridcell, which holds the day's `selected`, around the day's button).
 */
function namedWrapper(tree: AxTree, at: number): number | null {
  const up = nearestAncestor(tree, at, (node) => norm(node.name) !== '');
  return up !== null && norm(tree.nodes[up]!.name) === norm(tree.nodes[at]!.name) ? up : null;
}

/**
 * Controls whose click turns a state off as well as on, so checked or pressed they may be what the goal asks to undo:
 * a checkbox, a switch, a toggle button (`pressed` is only ever a toggle's).
 */
const TOGGLES: ReadonlySet<string> = new Set(['checkbox', 'switch', 'menuitemcheckbox']);
/** Items whose `selected` follows focus: a suggestion list's highlighted option is the one to click, not one chosen. */
const HIGHLIGHTS: ReadonlySet<string> = new Set(['option']);

function isSelected(node: AxNode): boolean {
  return node.attrs.selected === true || node.attrs.selected === 'true';
}

/**
 * Whether a control is in a state its click would not change, as it or its dropped wrapper carries it: selected (a
 * date, a tab) or checked (a radio). Never a toggle, the control's or the wrapper's (checkbox, switch, any pressed
 * button), whose click undoes it, nor an option, whose `selected` marks the highlighted suggestion.
 */
function settledOn(node: AxNode, wrapper: AxNode | undefined): boolean {
  const roles = wrapper === undefined ? [node.role] : [node.role, wrapper.role];
  if (roles.some((role) => TOGGLES.has(role) || HIGHLIGHTS.has(role))) return false;
  return [node, wrapper].some((one) => one !== undefined && (isSelected(one) || one.attrs.checked === 'true'));
}

/** Containers whose items are alternatives of one choice: one is picked, and picking another changes it. */
const CHOICE_SETS: ReadonlySet<string> = new Set([
  'listbox', 'grid', 'treegrid', 'radiogroup', 'tablist', 'tree', 'menu', 'menubar',
]);
/** Items that are such alternatives even outside such a container, by their role and place. */
const CHOICE_ITEMS: ReadonlySet<string> = new Set(['option', 'radio', 'tab', 'gridcell', 'menuitemradio', 'treeitem']);

/**
 * The choice a row is one alternative of (`StepRow.choice`): its listbox, grid, radio group, tab list, tree or menu,
 * and a dialog holding such a grid as a whole (two months of one date picker); else, for an item of `CHOICE_ITEMS` or
 * a row whose name carries digits (a day, a count), its role in its place. Undefined for any other row.
 */
function choiceOf(tree: AxTree, cand: Candidate): string | undefined {
  const set = nearestAncestor(tree, cand.node, (node) => CHOICE_SETS.has(node.role));
  if (set === null) {
    if (!CHOICE_ITEMS.has(cand.fp.role) && !/\d/.test(cand.fp.name)) return undefined;
    return `${cand.fp.role} in ${cand.fp.path}`;
  }
  const box = nearestAncestor(tree, set, (node) => DIALOG_ROLES.has(node.role));
  return `${cand.fp.role} at ${box ?? set}`;
}

/** A native select's chosen option: the option marked selected, else the value the tree gives the select. */
function chosenOf(tree: AxTree, node: number): string | null {
  const options = optionNodes(tree, node);
  if (options.length === 0) return null;
  const marked = options.find((at) => isSelected(tree.nodes[at]!));
  const label = marked === undefined ? norm(tree.nodes[node]?.value ?? '') : labelOf(tree.nodes[marked]);
  return label === '' ? null : label;
}

/**
 * Long lists of look-alike rows (a calendar's days, a list of results) are cut to their `FAMILY_MAX` heaviest: a
 * family is one role in one place whose names carry digits. Every other row is kept.
 */
function familyCut(cands: readonly Candidate[], weights: ReadonlyMap<number, number>): Set<number> {
  const families = new Map<string, Candidate[]>();
  for (const cand of cands) {
    if (!/\d/.test(cand.fp.name)) continue;
    const key = `${cand.fp.role}\n${cand.fp.path}`;
    families.set(key, [...(families.get(key) ?? []), cand]);
  }
  const cut = new Set<number>();
  for (const members of families.values()) {
    if (members.length <= FAMILY_MAX) continue;
    const ranked = [...members].sort((a, b) => (weights.get(b.node) ?? 0) - (weights.get(a.node) ?? 0) || a.node - b.node);
    for (const cand of ranked.slice(FAMILY_MAX)) cut.add(cand.node);
  }
  return cut;
}

/**
 * `run`'s element table from one look (design 2026-10-17 §2.1): the page's candidates, numbered in page order,
 * each `[n] role "name"` with its value or state; a wrapper that only repeats its control's name is left out, and a
 * long list of look-alikes keeps its heaviest rows (`familyCut`). A row says where it sits when that tells it apart:
 * its dialog, its path when another row has its role and name, its row's text when it has identical twins. A native
 * select's own options are its SELECT pairs, not rows. The goal's and the values' words rank a long option list.
 */
export function elementTable(tree: AxTree, cands: readonly Candidate[], hints: TableHints): ElementTable {
  const wanted = new Set(hints.words.map(fold));
  const numbers = new Set(hints.numbers);
  const wrapped = wrappers(tree, cands);
  const dropped = new Set(wrapped.keys());
  const outerOf = new Map([...wrapped].map(([outer, inner]) => [inner, outer]));
  const wrapperOf = (at: number): AxNode | undefined => {
    const outer = outerOf.get(at) ?? namedWrapper(tree, at);
    return outer === null ? undefined : tree.nodes[outer];
  };
  for (const cand of cands) for (const at of optionNodes(tree, cand.node)) dropped.add(at);
  const weights = new Map(cands.map((cand) => {
    const node = tree.nodes[cand.node]!;
    return [cand.node, weightOf(`${node.name} ${node.value ?? ''}`, wanted, numbers)];
  }));
  const listed = cands.filter((cand) => !dropped.has(cand.node));
  const cut = familyCut(listed, weights);
  const kept = listed.filter((cand) => !cut.has(cand.node));
  const sameName = new Map<string, number>();
  const nameKey = (cand: Candidate): string => `${cand.fp.role}\n${cand.fp.name}`;
  for (const cand of kept) sameName.set(nameKey(cand), (sameName.get(nameKey(cand)) ?? 0) + 1);
  const rows: StepRow[] = [];
  const byN = new Map<number, TableEntry>();
  const placed: (number | null)[] = hints.fills.map(() => null);
  kept.forEach((cand, at) => {
    const n = at + 1;
    const node = tree.nodes[cand.node]!;
    const dialog = nearestAncestor(tree, cand.node, (up) => DIALOG_ROLES.has(up.role));
    let where = '';
    const box = dialog === null ? null : tree.nodes[dialog]!;
    if (box) where += norm(box.name) === '' ? ` in ${box.role}` : ` in ${describeElement(box.role, box.name)}`;
    if ((sameName.get(nameKey(cand)) ?? 0) > 1 && cand.fp.path !== '') where += ` in=${JSON.stringify(cand.fp.path)}`;
    if (cand.fp.twins > 1) where += ` row=${JSON.stringify(cutName(norm(rowTextOf(tree, cand.node)), ROW_SHOWN))}`;
    const labels = optionNodes(tree, cand.node).map((at) => labelOf(tree.nodes[at])).filter((label) => label !== '');
    const options = rankedLabels(labels, wanted, numbers);
    const editable = node.attrs.disabled === undefined && node.attrs.readonly === undefined;
    const typable = isValueField(node) && options.length === 0 && editable;
    const head = `[${n}] ${describeElement(node.role, node.name)}`;
    const wrapper = wrapperOf(cand.node);
    const state = statePart(node, wrapper);
    const text = `${head}${valuePart(tree, cand, hints)}${state}${where}`;
    const label = `${head}${state}${where}`;
    const weight = weights.get(cand.node) ?? 0;
    const value = isValueField(node) ? node.value ?? '' : '';
    const holding = hints.fills.some((fill) => holds(value, fill.value));
    const asked = holding || (weight > 0 && settledOn(node, wrapper) && !isValueField(node));
    const chosen = chosenOf(tree, cand.node);
    const choice = choiceOf(tree, cand);
    const overlay = dialog !== null;
    const row: StepRow = { n, text, label, typable, clickable: true, options, overlay, weight, asked, chosen };
    rows.push(choice === undefined ? row : { ...row, choice });
    byN.set(n, { n, cand, options, overlay });
    hints.fills.forEach((fill, k) => {
      if (placed[k] === null && holds(value, fill.value)) placed[k] = n;
    });
  });
  return { rows, byN, placed };
}
