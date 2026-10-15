/**
 * `state --expect "<what the intended page is>"`, or `state --state key="<when>" … [--expect …]`: a custom state set
 * in the order given, which replaces the research set.
 */
export interface StateArgs {
  /** Fills the research set's `{expect}` slot; required without `--state`. */
  expect: string | null;
  /** The custom set, key to description, in the order given; `null` for the research set. */
  states: Readonly<Record<string, string>> | null;
}
