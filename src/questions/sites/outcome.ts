import { boundJsonBytes, canonicalJson, jsonTextBytes, utf8Bytes } from '../../egress';
import { BOUNDS } from '../bounds';
import type { DecisionSite } from '../decision-site';
import { boundedText } from '../present-candidates';
import { siteWording } from '../wording-hash';
import { readNoul } from './read-answer';
import type { OutcomeInput } from './site-inputs';
import { NOUL_BAND } from './starting-thresholds';
import { OUTCOME_QUESTION } from './wordings';

const QUESTION = 'landed';
/** Room for what egress cleaning may still change (a mask longer than what it hides) after the sides are fitted. */
const STATE_SLACK_BYTES = 256;

/**
 * Both sides cut to fit the state's byte bound with the rest of the state, so an outcome Decision can never be
 * `oversize` (spec §7.3) and an act is never dispatched towards one. Text of one or two bytes a unit keeps its
 * 4,000-unit cut; three-byte text (CJK) is cut further. A short side leaves its room to the other.
 */
function fitSides(before: string, after: string, budget: number): { before: string; after: string } {
  const sizes = { before: jsonTextBytes(before), after: jsonTextBytes(after) };
  if (sizes.before + sizes.after <= budget) return { before, after };
  const half = Math.floor(budget / 2);
  if (sizes.before <= half) return { before, after: boundJsonBytes(after, budget - sizes.before) };
  if (sizes.after <= half) return { before: boundJsonBytes(before, budget - sizes.after), after };
  return { before: boundJsonBytes(before, half), after: boundJsonBytes(after, half) };
}

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
    const fixed = utf8Bytes(canonicalJson({ ...state, before: '', after: '' }));
    const sides = fitSides(
      boundedText(input.before, BOUNDS.OUTCOME_SIDE_MAX),
      boundedText(input.after, BOUNDS.OUTCOME_SIDE_MAX),
      BOUNDS.STATE_MAX_BYTES - fixed - STATE_SLACK_BYTES,
    );
    state.before = sides.before;
    state.after = sides.after;
    return { request: { state, questions: { [QUESTION]: { type: 'noul', ...OUTCOME_QUESTION } } }, context: null };
  },
  read(answer, _context, threshold) {
    return readNoul(answer, threshold, 'landed');
  },
};
