import type { DismissInput, LocateInput, OutcomeInput, PageStateInput } from '../../../src/questions';

/** The four sets the thinning replay measures, by refsure site. */
export type CalibSite = 'locate' | 'dismiss' | 'page-state' | 'outcome';

/**
 * One converted benchmark item: refsure's own site input (lines already in line format v1), its gold and the
 * labels the fit groups by. `gold` and `alt` are strings: a candidate index, `none`, a state key, `true`/`false`.
 */
export type CalibItem = {
  id: string;
  base: string;
  lang: string;
  source: string;
  condition: string;
  gold: string;
  alt: string[];
  /** The set's own risk label (locate, outcome), `null` when it has none. */
  risk: string | null;
} & (
  | { site: 'locate'; input: Omit<LocateInput, 'order'> }
  | { site: 'dismiss'; input: Omit<DismissInput, 'order'> }
  | { site: 'page-state'; input: PageStateInput }
  | { site: 'outcome'; input: OutcomeInput }
);
