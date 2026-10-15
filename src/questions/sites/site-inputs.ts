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
