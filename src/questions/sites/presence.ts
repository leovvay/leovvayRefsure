import { BOUNDS } from '../bounds';
import type { DecisionSite } from '../decision-site';
import { boundedText } from '../present-candidates';
import { siteWording } from '../wording-hash';
import { readNoul } from './read-answer';
import type { PresenceInput } from './site-inputs';
import { NOUL_BAND } from './starting-thresholds';
import { PRESENCE_QUESTION } from './wordings';

const QUESTION = 'present';

/** Whether what a wait expects is on the page. Only `present` is an answer; a timeout says `not_seen`, never absent. */
export const presenceSite: DecisionSite<PresenceInput, null, 'present'> = {
  id: 'presence',
  kind: 'noul',
  question: QUESTION,
  wording: siteWording('noul', PRESENCE_QUESTION.instructions, { ...PRESENCE_QUESTION.criteria }),
  policy: { threshold: { jev: NOUL_BAND, openai: NOUL_BAND }, combos: ['agree'], maturity: 'inherited' },
  build(input) {
    return {
      request: {
        state: {
          expectation: boundedText(input.expectation, BOUNDS.DESCRIPTION_MAX, { inline: true }),
          page_url: boundedText(input.pageUrl, BOUNDS.URL_MAX, { inline: true }),
          page: boundedText(input.page, BOUNDS.PAGE_MAX),
        },
        questions: { [QUESTION]: { type: 'noul', ...PRESENCE_QUESTION } },
      },
      context: null,
    };
  },
  read(answer, _context, threshold) {
    return readNoul(answer, threshold, 'present');
  },
};
