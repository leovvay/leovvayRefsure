import { BOUNDS } from '../bounds';
import { boundedText } from '../present-candidates';
import { candidateSite } from './candidate-site';
import type { LocateInput } from './site-inputs';
import { LOCATE_ROWS } from './starting-thresholds';
import { LOCATE_INSTRUCTIONS, LOCATE_NONE } from './wordings';

/** `locate --recorded`: which current candidate is the recorded element. Jev only, by risk row. */
export const locateSite = candidateSite<LocateInput>({
  id: 'locate',
  question: 'element',
  instructions: LOCATE_INSTRUCTIONS,
  none: LOCATE_NONE,
  policy: { threshold: { jev: LOCATE_ROWS }, maturity: 'inherited' },
  max: BOUNDS.SHORTLIST_MAX,
  state: (input) => ({
    recorded: boundedText(input.recorded, BOUNDS.CANDIDATE_LINE_MAX, { inline: true }),
    step_intent: boundedText(input.intent, BOUNDS.INTENT_MAX, { inline: true }),
  }),
  lines: (input) => input.lines,
});
