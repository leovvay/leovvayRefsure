import type { GoldRef } from '../../calibrate/lib/gold-ref';

/** The sites an authored set asks, each captured from live pages the way its command reads them. */
export type CaptureSite = 'locate' | 'find' | 'dismiss' | 'presence' | 'page-state' | 'outcome' | 'option-map';

export type ElementRef = Extract<GoldRef, { kind: 'element' }>;

/**
 * A gold (or alt) as the set states it: refsure's mapping key (`ref`: role, name, ordinal, path; `none`; a key) and,
 * on candidate sites, the authored `{selector, name}` the capture checks the mapped element against.
 */
export interface Truth { ref: GoldRef; selector: string | null; name: string | null }

/** A page of a set and the URL path (with query) it is served at. */
export interface Side { page: string; at: string }

/**
 * One authored row (N1-N10 shapes) as the capture reads it. `meta` keeps the row's own labels (template, injected,
 * attack, twin, mask_class, pii, kind, ...) for the analysis; nothing in it is sent.
 */
export interface CaptureItem {
  id: string;
  base: string;
  set: string;
  site: CaptureSite;
  lang: string;
  source: string;
  condition: string;
  risk: string | null;
  page: Side;
  gold: Truth;
  alt: Truth[];
  /** N10: the gold when PII masks are on (masking may remove the evidence: `none`). */
  goldMasksOn?: Truth;
  /** Mask modes to ask in; each mode is its own item (`<id>~masks-on|off`) when there are two. */
  masks: boolean[];
  visualOnly: boolean;
  meta: Record<string, unknown>;
  intent?: string;
  within?: string | null;
  expectation?: string;
  expect?: string;
  /** locate: the page the step was recorded on and the recorded element there. */
  recorded?: { page: Side; ref: ElementRef };
  /** outcome: both pages and the element acted on in the before page. */
  outcome?: { before: Side; after: Side; acted: ElementRef; actedSelector: string | null };
  /** option-map: the field (a select or combobox), the meaning wanted, whether the list shows only once opened. */
  optionMap?: { field: ElementRef; fieldSelector: string | null; want: string; open: boolean };
}
