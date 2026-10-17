import type { CandidateOrder } from '../presented-candidates';

/*
  What each site is built from. Lines are line format v1 (spec §8.3); a
  site never sees a ref, an attribute or a textbox value. `order` is for
  calibration only: commands leave it out and get the request's own shuffle.
*/

/** `locate --recorded`: `recorded` is the agent's line verbatim, `intent` is '' unless both were given. */
export interface LocateInput { recorded: string; intent: string; lines: readonly string[]; order?: CandidateOrder }

/** `locate --intent` and `verify-target`. */
export interface FindInput { intent: string; lines: readonly string[]; order?: CandidateOrder }

/** `overlay` is the container's visible text; `lines` its buttons and links. */
export interface DismissInput { overlay: string; lines: readonly string[]; order?: CandidateOrder }

/**
 * `states` in presentation order, unshuffled. A description may hold the literal `{expect}` slot, filled from
 * `expect`; the research set (`RESEARCH_STATES`) is `inherited`, any other set `experimental`.
 */
export interface PageStateInput {
  pageUrl: string;
  page: string;
  states: Readonly<Record<string, string>>;
  expect?: string;
}

/** `acted` names the control the step pressed: two controls can change a page the same way. */
export interface OutcomeInput { intent: string; acted?: string; before: string; after: string }

export interface PresenceInput { expectation: string; pageUrl: string; page: string }

/** `field` is the field's v1 line or name; `options` are the option names, in page order. */
export interface OptionMapInput { field: string; want: string; options: readonly string[]; order?: CandidateOrder }

/** One `--fill` of `run`: what the value is (`destination`) and the value itself, which this site sends. */
export interface StepFill { key: string; value: string }

/** One row of `run`'s element table, built by the caller from one look. Its text is page text. */
export interface StepRow {
  /** The element's number in page order, as the table shows it (`[n]`). */
  n: number;
  /** `[n] role "name"`, then its value or state, and its row or dialog when that tells it apart. */
  text: string;
  /** A field to type into: it may take a TYPE. */
  typable: boolean;
  /** It may take a CLICK: the caller keeps a field it can type into out of CLICK while a value waits for it. */
  clickable: boolean;
  /** A native select's option labels in page order; empty for any other element. */
  options: readonly string[];
  /** It sits in a dialog or overlay: kept first when the table is cut to the questions bound. */
  overlay: boolean;
  /** How much of the goal and the values it names: a cut keeps the heavier rows first within their tier. */
  weight: number;
}

/**
 * One step of `run`: the goal, the agent's `--fill` keys and values, the page as one look read it (its text with
 * nothing typed in it, the lines new since the run began, the element table) and the last steps. PRESS_ENTER and
 * SCROLL_DOWN are offered only when the caller can run them now.
 */
export interface StepInput {
  goal: string;
  fills: readonly StepFill[];
  /** For each fill, where its value is, in a few words: `in [3]`, `typed at step 2`, `not typed yet`. */
  placed: readonly string[];
  /** For each fill, whether it may be typed now: a value a field of this look already shows is offered no TYPE. */
  open: readonly boolean[];
  /** `--expect`: asks the done Noul over `newText`. */
  expect: string | null;
  pageUrl: string;
  title: string;
  page: string;
  newText: string;
  /** The last steps, oldest first, one line each. */
  recent: readonly string[];
  rows: readonly StepRow[];
  canPressEnter: boolean;
  canScroll: boolean;
}
