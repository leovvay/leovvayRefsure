import type { DecisionNoulQuestion } from '../wire-types';

/*
  The wording of every browser Decision site. Each is the one its research
  measured, ported verbatim from the author's earlier decision code, except
  FIND and OPTION_MAP, which are new and start experimental. A wording change
  is a threshold change: every site hashes its wording at load.
*/

export const LOCATE_INSTRUCTIONS = 'A browser automation recorded an action on one element of a web page. The page has changed since (a new build, edited copy, moved, duplicated or translated elements). `recorded` describes that element as it was. Which current candidate is the same element, the one a replay must act on? Builds often regenerate class names and ids, so weigh what the element is and does (role, link target, form field name, the meaning of its text in any language, its section and heading, its position) over exact class or id strings. Answer none when no candidate is the recorded element.';
export const LOCATE_NONE = 'None of the candidates is the recorded element: it was removed from the page.';

export const FIND_INSTRUCTIONS = 'A browser automation must act on one element of a web page. `intent` says what the element is for. Which current candidate is that element? Weigh what the element is and does (its role, the meaning of its text in any language, its section and heading) over exact wording. Answer none when no candidate is that element.';
export const FIND_NONE = 'None of the candidates is the element the intent describes.';

export const DISMISS_INSTRUCTIONS = 'A pop-up or banner that is not part of the task is open on the page. Which control closes or dismisses it while changing nothing: no enabling features, no subscribing, no accepting offers or purchases? For a cookie banner, rejecting non-essential cookies or closing counts as dismissing. Answer none if no control only dismisses it.';
export const DISMISS_NONE = 'No control only dismisses it.';

export const PAGE_STATE_INSTRUCTIONS = 'A browser automation is replaying a recorded procedure and is now showing the page described in `page`. Which of these states is the browser in?';

export const OUTCOME_QUESTION: Omit<DecisionNoulQuestion, 'type'> = {
  instructions: 'A browser automation replayed one recorded step. Using the page state BEFORE and AFTER the step, decide whether the step achieved its intent (step_intent).',
  criteria: {
    true: 'The AFTER page shows the intended result happened: the intended page opened, the form was accepted, or the intended change is visible.',
    false: 'The intent was not achieved: nothing changed, an error or validation message appeared, a different page or item was affected, a dialog or overlay blocked the action, sign-in or a bot check was asked for, or the result is still loading.',
  },
};

export const PRESENCE_QUESTION: Omit<DecisionNoulQuestion, 'type'> = {
  instructions: 'A browser automation checks the page described in `page` for what `expectation` describes. The page shows it.',
  criteria: {
    true: 'It is visibly there: the page shows that content, message or state, even if worded differently or in another language.',
    false: 'It is not there: the page shows something else, an error, a sign-in or a bot check, or the result is still loading.',
  },
};

export const OPTION_MAP_INSTRUCTIONS = 'A form field offers the options listed. Which option means what `want` describes, in any language or wording? Answer none when no option means it.';
export const OPTION_NONE = 'No option means it.';

/** The slot `expected` carries; the caller's text replaces it, so the wording hash never sees it. */
export const EXPECT_SLOT = '{expect}';

/** The measured page-state set, in its research order. `expected` holds the `{expect}` slot. */
export const RESEARCH_STATES: Readonly<Record<string, string>> = Object.freeze({
  expected: `It is the intended page — ${EXPECT_SLOT} — though layout or wording may differ from what was recorded.`,
  login_wall: 'A sign-in, log-in or session-expired page is shown instead of the intended page.',
  bot_challenge: 'A CAPTCHA, "verify you are human", browser check, or anti-bot block page.',
  error_page: 'An error page: not found (404), server error (5xx), maintenance, or an app error message instead of content.',
  blocking_modal: 'The intended page is covered by a cookie-consent dialog, popup or modal that must be dismissed before continuing.',
  rate_limited: 'A "too many requests", rate-limit or quota-exceeded page or message.',
  unexpected_page: 'A normal working page, but not the intended one (a different item, section or site).',
});

/** The research set with the caller's description of the intended page in the slot. */
export function researchStatesFor(expect: string): Record<string, string> {
  const states: Record<string, string> = {};
  for (const [key, description] of Object.entries(RESEARCH_STATES)) {
    states[key] = description.replace(EXPECT_SLOT, () => expect);
  }
  return states;
}
