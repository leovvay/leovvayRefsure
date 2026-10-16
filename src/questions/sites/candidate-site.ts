import { canonicalJson, utf8Bytes } from '../../egress';
import { BOUNDS } from '../bounds';
import type { DecisionSite } from '../decision-site';
import { NONE_KEY, presentCandidates } from '../present-candidates';
import type { CandidateOrder, PresentedCandidates } from '../presented-candidates';
import { siteWording } from '../wording-hash';
import type { CandidateSiteSpec } from './candidate-site-spec';
import { readChoice } from './read-answer';

/** The questions bound with a tenth to spare, and how much of the list each fitting pass keeps. */
const FIT_BYTES = Math.floor(BOUNDS.QUESTIONS_MAX_BYTES * 0.9);
const FIT_STEP = 0.9;

export function candidateSite<In extends { order?: CandidateOrder }>(
  spec: CandidateSiteSpec<In>,
): DecisionSite<In, PresentedCandidates, number> {
  return {
    id: spec.id,
    kind: 'choice',
    question: spec.question,
    wording: siteWording('choice', spec.instructions, { [NONE_KEY]: spec.none }),
    policy: spec.policy,
    build(input) {
      const state = spec.state(input);
      let lines = spec.lines(input).slice(0, spec.max);
      for (;;) {
        const presented = presentCandidates(lines, spec.none, Object.values(state), input.order);
        const questions = { [spec.question]: { type: 'choice' as const, instructions: spec.instructions, criteria: presented.criteria } };
        // Approve re-cleans every string; the margin keeps a mask that grows a line from tipping it over.
        if (lines.length <= 1 || utf8Bytes(canonicalJson(questions)) <= FIT_BYTES) {
          return { request: { state, questions }, context: presented };
        }
        lines = lines.slice(0, Math.floor(lines.length * FIT_STEP));
      }
    },
    read(answer, context, threshold) {
      return readChoice(answer, threshold, (key) => context.indexOf(key), NONE_KEY, (key) => context.quote(key));
    },
  };
}
