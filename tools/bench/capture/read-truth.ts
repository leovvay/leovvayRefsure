import { str } from '../../calibrate/lib/coerce';
import type { ElementRef, Truth } from './capture-item';

/*
  Gold and alt of an authored row. Candidate sites state the element as `{selector, name}` beside its mapping key
  (`gold_ref`, `alt_ref`: role, name, ordinal, optional path); `none` stays `none`; any other string is a key (a
  page state, `true`/`false`). Option-map golds are option labels (`{name}`, `{label}` or a string).
*/

type Row = Record<string, unknown>;

export function elementRef(value: unknown): ElementRef | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Row;
  if (str(r.role) === '' || typeof r.name !== 'string') return null;
  const ref: ElementRef = { kind: 'element', role: str(r.role), name: r.name, ordinal: typeof r.ordinal === 'number' ? r.ordinal : 1 };
  if (typeof r.path === 'string') ref.path = r.path;
  if (typeof r.hint === 'string') ref.hint = r.hint;
  if (typeof r.of === 'number') ref.of = r.of;
  return ref;
}

/** One stated truth; null when an element gold has no mapping key or the value is missing (the row is skipped). */
export function truthOf(value: unknown, ref: unknown): Truth | null {
  if (value === 'none') return { ref: { kind: 'none' }, selector: null, name: null };
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { ref: { kind: 'key', value: String(value) }, selector: null, name: null };
  }
  const v = value as Row;
  const element = elementRef(ref);
  if (element === null) return null;
  return { ref: element, selector: typeof v.selector === 'string' ? v.selector : null, name: typeof v.name === 'string' ? v.name : null };
}

/** Option-map: the label the gold option shows (`none` when the set says none). */
export function optionLabelOf(value: unknown): string | 'none' | null {
  if (value === 'none') return 'none';
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return null;
  const v = value as Row;
  const label = [v.name, v.label, v.text, v.value].find((x) => typeof x === 'string');
  return typeof label === 'string' ? label : null;
}

/** Gold and alt of a candidate or key row; `{skip}` names why a row cannot be mapped. */
export function truthsOf(row: Row): { gold: Truth; alt: Truth[]; goldMasksOn?: Truth } | { skip: string } {
  if (row.gold === null || row.gold === undefined) return { skip: 'row without gold' };
  const gold = truthOf(row.gold, row.gold_ref);
  if (gold === null) return { skip: 'gold element without gold_ref' };
  const alts = Array.isArray(row.alt) ? row.alt : [];
  const altRefs = Array.isArray(row.alt_ref) ? row.alt_ref : [];
  const alt: Truth[] = [];
  for (const [at, value] of alts.entries()) {
    const truth = truthOf(value, altRefs[at]);
    if (truth === null) return { skip: value === null || value === undefined ? `alt ${at} without a value` : `alt ${at} without alt_ref` };
    alt.push(truth);
  }
  if (!('gold_masks_on' in row)) return { gold, alt };
  const on = row.gold_masks_on;
  if (on === 'none' || on === null) return { gold, alt, goldMasksOn: { ref: { kind: 'none' }, selector: null, name: null } };
  if (on === undefined) return { skip: 'gold_masks_on without a value' };
  if (typeof on !== 'object') return { gold, alt, goldMasksOn: truthOf(on, null)! };
  const same = (on as Row).selector === gold.selector;
  if (!same) return { skip: 'gold_masks_on names another element without a ref' };
  return { gold, alt, goldMasksOn: gold };
}
