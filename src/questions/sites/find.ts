import { BOUNDS } from '../bounds';
import { boundedText } from '../present-candidates';
import { candidateSite } from './candidate-site';
import type { FindInput } from './site-inputs';
import { LOCATE_ROWS } from './starting-thresholds';
import { FIND_INSTRUCTIONS, FIND_NONE } from './wordings';

/** `locate --intent` and `verify-target`: a new wording, so it starts experimental. Jev only, by risk row. */
export const findSite = candidateSite<FindInput>({
  id: 'find',
  question: 'element',
  instructions: FIND_INSTRUCTIONS,
  none: FIND_NONE,
  policy: { threshold: { jev: LOCATE_ROWS }, maturity: 'experimental' },
  max: BOUNDS.SHORTLIST_MAX,
  state: (input) => ({ intent: boundedText(input.intent, BOUNDS.INTENT_MAX, { inline: true }) }),
  lines: (input) => input.lines,
});
