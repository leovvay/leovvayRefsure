import { BOUNDS } from '../bounds';
import type { DecisionSite } from '../decision-site';
import { boundedText } from '../present-candidates';
import type { SitePolicy } from '../site-policy';
import { siteWording, wordingHash } from '../wording-hash';
import { readChoice } from './read-answer';
import type { PageStateInput } from './site-inputs';
import { CHOICE_START } from './starting-thresholds';
import { EXPECT_SLOT, PAGE_STATE_INSTRUCTIONS, RESEARCH_STATES } from './wordings';

const QUESTION = 'page_state';

const POLICY: SitePolicy = {
  threshold: { jev: CHOICE_START, openai: CHOICE_START },
  combos: ['fallback'],
  maturity: 'inherited',
};

/** The research set's own description, with the caller's text in `{expect}` or the slot left as is. */
function isResearchDescription(key: string, description: string): boolean {
  const template = RESEARCH_STATES[key];
  if (template === undefined) return false;
  if (description === template) return true;
  const [head, tail] = template.split(EXPECT_SLOT);
  if (head === undefined || tail === undefined) return false;
  return description.length >= head.length + tail.length && description.startsWith(head) && description.endsWith(tail);
}

/** The measured set in its measured order; any other set is a new wording (spec §8.6). */
function isResearchSet(states: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(states);
  const research = Object.keys(RESEARCH_STATES);
  if (keys.length !== research.length) return false;
  return keys.every((key, index) => key === research[index] && isResearchDescription(key, states[key]!));
}

/** A custom set hashes by its keys alone: each description is the caller's text, so it becomes `{state:<key>}`. */
function customWording(states: Readonly<Record<string, string>>): { version: number; hash: string } {
  const labels: Record<string, string> = {};
  for (const key of Object.keys(states)) labels[key] = `{state:${key}}`;
  return { version: 1, hash: wordingHash('choice', PAGE_STATE_INSTRUCTIONS, labels) };
}

/** Which of the offered states the page is in. The keys are the caller's, so nothing is shuffled. */
export const pageStateSite: DecisionSite<PageStateInput, null, string> = {
  id: 'page-state',
  kind: 'choice',
  question: QUESTION,
  wording: siteWording('choice', PAGE_STATE_INSTRUCTIONS, RESEARCH_STATES),
  policy: POLICY,
  maturityFor(input) {
    return isResearchSet(input.states) ? POLICY.maturity : 'experimental';
  },
  wordingFor(input) {
    return isResearchSet(input.states) ? pageStateSite.wording : customWording(input.states);
  },
  build(input) {
    const criteria: Record<string, string> = {};
    for (const [key, description] of Object.entries(input.states)) {
      const expect = input.expect;
      const filled = expect === undefined ? description : description.replace(EXPECT_SLOT, () => expect);
      criteria[key] = boundedText(filled, BOUNDS.DESCRIPTION_MAX, { inline: true });
    }
    return {
      request: {
        state: {
          page_url: boundedText(input.pageUrl, BOUNDS.URL_MAX, { inline: true }),
          page: boundedText(input.page, BOUNDS.PAGE_MAX),
        },
        questions: { [QUESTION]: { type: 'choice', instructions: PAGE_STATE_INSTRUCTIONS, criteria } },
      },
      context: null,
    };
  },
  read(answer, _context, threshold) {
    // Validation already bound the choice to the offered keys, and the set has no `none`.
    return readChoice(answer, threshold, (key) => key, null);
  },
};
