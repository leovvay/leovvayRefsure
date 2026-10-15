import type { GoldRef } from './gold-ref';

/** The sites the Orca-native replay asks, each built from a live snapshot the way its command builds it. */
export type NativeSite = 'find' | 'locate' | 'dismiss' | 'presence' | 'page-state';

/**
 * One labelled page as the Orca-native replay reads it, whatever file format its set uses: where the page is,
 * what the command is asked, and the gold to map onto what refsure sees.
 */
export interface NativeItem {
  id: string;
  base: string;
  /** The set file the item came from. */
  set: string;
  site: NativeSite;
  /** The stored page, relative to the set's root directory. */
  page: string;
  /** Where it is served: a URL path with its query (`/pages/001.html?ref=…`, or the path it was recorded at). */
  at: string;
  /** locate only: the page the step was recorded on; the recorded line is refsure's own line for `recordedRef`. */
  recordedPage?: string;
  recordedRef?: GoldRef;
  lang: string;
  source: string;
  condition: string;
  /** The risk the caller claims (`--risk`), when the set gives one. */
  risk: string | null;
  /** find and locate: `--intent`; find: `--within`. */
  intent?: string;
  within?: string | null;
  /** presence: `wait-for --expect`. */
  expectation?: string;
  /** page-state: `state --expect`, and the PII mask modes to ask it in (each mode is its own item). */
  expect?: string;
  masks?: readonly boolean[];
  gold: GoldRef;
  alt: GoldRef[];
  /** The set marks the answer as visible only in the picture: the page's text says otherwise or nothing. */
  visualOnly?: boolean;
}
