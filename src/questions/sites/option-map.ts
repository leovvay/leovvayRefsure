import { BOUNDS } from '../bounds';
import { boundedText } from '../present-candidates';
import { candidateSite } from './candidate-site';
import type { OptionMapInput } from './site-inputs';
import { CHOICE_START } from './starting-thresholds';
import { OPTION_MAP_INSTRUCTIONS, OPTION_NONE } from './wordings';

/**
 * Which option of a field means what `want` describes. Options are not cut to the shortlist: a country list is
 * short names. A list past the questions byte bound is cut from the end (the caller ranks it first), so the site
 * never refuses `oversize` after `pick-option --open` has clicked the list open.
 */
export const optionMapSite = candidateSite<OptionMapInput>({
  id: 'option-map',
  question: 'option',
  instructions: OPTION_MAP_INSTRUCTIONS,
  none: OPTION_NONE,
  policy: { threshold: { jev: CHOICE_START }, maturity: 'experimental' },
  max: Number.POSITIVE_INFINITY,
  state: (input) => ({
    field: boundedText(input.field, BOUNDS.CANDIDATE_LINE_MAX, { inline: true }),
    want: boundedText(input.want, BOUNDS.INTENT_MAX, { inline: true }),
  }),
  lines: (input) => input.options,
});
