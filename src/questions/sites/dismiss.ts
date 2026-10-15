import { BOUNDS } from '../bounds';
import { boundedText } from '../present-candidates';
import { candidateSite } from './candidate-site';
import type { DismissInput } from './site-inputs';
import { DISMISS_START } from './starting-thresholds';
import { DISMISS_INSTRUCTIONS, DISMISS_NONE } from './wordings';

/**
 * Which control of an overlay only closes it. OpenAI holds a row so it can join `agree`; `decide` never lets it
 * answer a dismiss alone (spec §7.1).
 */
export const dismissSite = candidateSite<DismissInput>({
  id: 'dismiss',
  question: 'control',
  instructions: DISMISS_INSTRUCTIONS,
  none: DISMISS_NONE,
  policy: { threshold: { jev: DISMISS_START, openai: DISMISS_START }, combos: ['agree'], maturity: 'inherited' },
  max: BOUNDS.DISMISS_MAX,
  state: (input) => ({ popup: boundedText(input.overlay, BOUNDS.OVERLAY_MAX) }),
  lines: (input) => input.lines,
});
