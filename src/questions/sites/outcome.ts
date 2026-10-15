import { BOUNDS } from '../bounds';
import type { DecisionSite } from '../decision-site';
import { boundedText } from '../present-candidates';
import { siteWording } from '../wording-hash';
import { readNoul } from './read-answer';
import type { OutcomeInput } from './site-inputs';
import { NOUL_BAND } from './starting-thresholds';
import { OUTCOME_QUESTION } from './wordings';

const QUESTION = 'landed';

/** Whether a step's effect shows on the page after it. Only `landed` is an answer; anything else abstains. */
export const outcomeSite: DecisionSite<OutcomeInput, null, 'landed'> = {
  id: 'outcome',
  kind: 'noul',
  question: QUESTION,
  wording: siteWording('noul', OUTCOME_QUESTION.instructions, { ...OUTCOME_QUESTION.criteria }),
  policy: { threshold: { jev: NOUL_BAND }, maturity: 'inherited' },
  build(input) {
    const state: Record<string, string> = {
      step_intent: boundedText(input.intent, BOUNDS.INTENT_MAX, { inline: true }),
    };
    // Which control the step pressed: two controls can change a page the same way.
    if (input.acted) state.acted_element = boundedText(input.acted, BOUNDS.INTENT_MAX, { inline: true });
    state.before = boundedText(input.before, BOUNDS.OUTCOME_SIDE_MAX);
    state.after = boundedText(input.after, BOUNDS.OUTCOME_SIDE_MAX);
    return { request: { state, questions: { [QUESTION]: { type: 'noul', ...OUTCOME_QUESTION } } }, context: null };
  },
  read(answer, _context, threshold) {
    return readNoul(answer, threshold, 'landed');
  },
};
