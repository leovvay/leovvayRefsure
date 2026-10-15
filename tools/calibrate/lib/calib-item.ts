import type {
  DismissInput, FindInput, LocateInput, OutcomeInput, PageStateInput, PresenceInput,
} from '../../../src/questions';

/** The sites the replays measure: the thinning replay's four, plus `find` and `presence` from the Orca-native one. */
export type CalibSite = 'locate' | 'find' | 'dismiss' | 'page-state' | 'outcome' | 'presence';

/**
 * One item ready to ask: refsure's own site input (lines in line format v1), its gold and the labels the fit
 * groups by. `gold` and `alt` are strings: a candidate index, `none`, a state key, `true`/`false`.
 */
export type CalibItem = {
  id: string;
  base: string;
  lang: string;
  source: string;
  condition: string;
  gold: string;
  alt: string[];
  /** The set's own risk label (locate, find, outcome), `null` when it has none. */
  risk: string | null;
  /** The set file the item came from, when a replay pools several. */
  set?: string;
  /** The PII mask mode the egress pipeline applies to this item; the config's when absent. */
  masks?: boolean;
  /** The set marks the answer as visible only in the picture, never in the page's text. */
  visualOnly?: boolean;
} & (
  | { site: 'locate'; input: Omit<LocateInput, 'order'> }
  | { site: 'find'; input: Omit<FindInput, 'order'> }
  | { site: 'dismiss'; input: Omit<DismissInput, 'order'> }
  | { site: 'page-state'; input: PageStateInput }
  | { site: 'outcome'; input: OutcomeInput }
  | { site: 'presence'; input: PresenceInput }
);
